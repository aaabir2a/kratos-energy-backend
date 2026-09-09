import { Prisma, type EnrolmentStatus, type SequenceTrigger } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../shared/errors/AppError';
import { outbox } from './outbox.service';
import { mergeDataForLead } from './merge';
import type { CreateSequenceInput, UpdateSequenceInput, SequenceStepInput } from './messaging.schema';

// Sequences: a lead joins one, and its steps are queued as ordinary outbox
// messages. Two decisions shape everything here.
//
// First, every step is scheduled at enrolment rather than one at a time. The
// queue then shows the whole future of a lead's follow-up, and a step cannot be
// forgotten because the previous one failed.
//
// Second, stopping is cheap and total: cancelling the enrolment cancels every
// message still pending for it. A follow-up that arrives after the customer has
// already replied is worse than no follow-up at all, so the stop path is the
// one that has to be reliable.

const sequenceInclude = {
  steps: {
    orderBy: { position: 'asc' },
    include: { template: { select: { id: true, name: true, subject: true, isActive: true } } },
  },
} satisfies Prisma.MessageSequenceInclude;

/** Conditions a lead must satisfy to be enrolled, stored as JSON on the sequence. */
interface SequenceFilters {
  enquiryType?: 'RESIDENTIAL' | 'COMMERCIAL';
  sourceIds?: string[];
}

interface EnrolmentLead {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  suburb?: string | null;
  state?: string | null;
  enquiryType?: string | null;
  leadSourceId?: string | null;
  officeId?: string | null;
  assignedTo?: { firstName: string; lastName: string } | null;
}

function matchesFilters(lead: EnrolmentLead, raw: Prisma.JsonValue | null): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
  const filters = raw as SequenceFilters;
  if (filters.enquiryType && lead.enquiryType !== filters.enquiryType) return false;
  if (filters.sourceIds?.length && !filters.sourceIds.includes(lead.leadSourceId ?? '')) return false;
  return true;
}

export const sequenceService = {
  // ── Authoring ────────────────────────────────────────

  async list() {
    const sequences = await prisma.messageSequence.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: sequenceInclude,
    });
    // Counts staff actually care about: who is in it, and what it has sent.
    const stats = await prisma.sequenceEnrolment.groupBy({
      by: ['sequenceId', 'status'],
      _count: { _all: true },
    });
    return sequences.map((s) => {
      const mine = stats.filter((x) => x.sequenceId === s.id);
      const count = (status: EnrolmentStatus) =>
        mine.find((x) => x.status === status)?._count._all ?? 0;
      return {
        ...s,
        enrolled: { active: count('ACTIVE'), held: count('HELD'), completed: count('COMPLETED'), cancelled: count('CANCELLED') },
      };
    });
  },

  async get(id: string) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id, deletedAt: null },
      include: sequenceInclude,
    });
    if (!sequence) throw AppError.notFound('Sequence not found');
    return sequence;
  },

  async create(input: CreateSequenceInput, userId: string) {
    return prisma.messageSequence.create({
      data: {
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        channel: input.channel ?? 'EMAIL',
        filters: (input.filters ?? undefined) as Prisma.InputJsonValue,
        stopOnReply: input.stopOnReply ?? true,
        stopOnStageChange: input.stopOnStageChange ?? true,
        stopOnConvert: input.stopOnConvert ?? true,
        // Never live on creation: steps have to be added first.
        isActive: false,
        createdById: userId,
      },
      include: sequenceInclude,
    });
  },

  async update(id: string, input: UpdateSequenceInput) {
    const sequence = await this.get(id);

    if (input.isActive && !sequence.steps.length) {
      throw AppError.badRequest('Add at least one step before switching this sequence on');
    }
    if (input.isActive) {
      const archived = sequence.steps.filter((s) => !s.template.isActive);
      if (archived.length) {
        throw AppError.badRequest(
          `Step ${archived[0].position + 1} uses an archived template — reactivate it or pick another`,
        );
      }
    }

    return prisma.messageSequence.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.filters !== undefined ? { filters: input.filters as Prisma.InputJsonValue } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.stopOnReply !== undefined ? { stopOnReply: input.stopOnReply } : {}),
        ...(input.stopOnStageChange !== undefined ? { stopOnStageChange: input.stopOnStageChange } : {}),
        ...(input.stopOnConvert !== undefined ? { stopOnConvert: input.stopOnConvert } : {}),
      },
      include: sequenceInclude,
    });
  },

  /**
   * Replace the whole step list in one transaction. Editing steps piecemeal
   * would let a sequence sit briefly with duplicate positions, and the unique
   * constraint would reject it half-way through.
   */
  async setSteps(id: string, steps: SequenceStepInput[]) {
    const sequence = await this.get(id);

    const templateIds = [...new Set(steps.map((s) => s.templateId))];
    const templates = await prisma.messageTemplate.findMany({
      where: { id: { in: templateIds }, deletedAt: null },
      select: { id: true },
    });
    if (templates.length !== templateIds.length) {
      throw AppError.badRequest('One of these steps points at a template that no longer exists');
    }

    await prisma.$transaction([
      prisma.sequenceStep.deleteMany({ where: { sequenceId: id } }),
      ...steps.map((step, index) =>
        prisma.sequenceStep.create({
          data: {
            sequenceId: id,
            templateId: step.templateId,
            position: index,
            delayMinutes: step.delayMinutes,
            channel: sequence.channel,
          },
        }),
      ),
    ]);
    return this.get(id);
  },

  async remove(id: string) {
    await this.get(id);
    return prisma.messageSequence.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  // ── Enrolment ────────────────────────────────────────

  /**
   * Enrol a lead and queue every step. Returns null when nothing applied, which
   * is the common case — most leads match no active sequence.
   */
  async enrol(sequenceId: string, lead: EnrolmentLead, opts: { dealId?: string | null } = {}) {
    const sequence = await prisma.messageSequence.findFirst({
      where: { id: sequenceId, deletedAt: null },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!sequence || !sequence.steps.length) return null;

    // Re-enrolling a lead already being followed up would double every message.
    const existing = await prisma.sequenceEnrolment.findFirst({
      where: { sequenceId, leadId: lead.id, status: { in: ['ACTIVE', 'HELD'] } },
      select: { id: true },
    });
    if (existing) return null;

    const enrolment = await prisma.sequenceEnrolment.create({
      data: { sequenceId, leadId: lead.id, dealId: opts.dealId ?? null, status: 'ACTIVE' },
      select: { id: true },
    });

    const now = Date.now();
    const merge = mergeDataForLead(lead);
    let queued = 0;

    for (const step of sequence.steps) {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: step.templateId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      const outcome = await outbox.enqueue({
        channel: step.channel,
        leadId: lead.id,
        dealId: opts.dealId ?? null,
        enrolmentId: enrolment.id,
        stepId: step.id,
        templateId: step.templateId,
        templateVersionId: template?.versions[0]?.id ?? null,
        toEmail: lead.email,
        mergeData: merge,
        // Delays are measured from enrolment, not from the previous send, so a
        // step that fails does not drag the rest of the ladder with it.
        scheduledFor: new Date(now + step.delayMinutes * 60_000),
        officeId: lead.officeId,
        idempotencyKey: `enrol:${enrolment.id}:${step.id}`,
      });
      if (outcome.status === 'queued') queued += 1;
    }

    logger.info({ sequenceId, leadId: lead.id, queued }, 'lead enrolled in sequence');
    return { enrolmentId: enrolment.id, queued };
  },

  /** Every active sequence for a trigger whose filters this lead satisfies. */
  async enrolMatching(trigger: SequenceTrigger, lead: EnrolmentLead, opts: { dealId?: string | null } = {}) {
    const candidates = await prisma.messageSequence.findMany({
      where: { trigger, isActive: true, deletedAt: null },
      select: { id: true, filters: true },
    });
    const results = [];
    for (const candidate of candidates) {
      if (!matchesFilters(lead, candidate.filters)) continue;
      const result = await this.enrol(candidate.id, lead, opts);
      if (result) results.push(result);
    }
    return results;
  },

  // ── Stopping ─────────────────────────────────────────

  /**
   * Cancel every active enrolment for a lead, and with it every message still
   * queued. `respect` names the stop rule in play so a sequence configured to
   * ignore that rule keeps running.
   */
  async stopForLead(
    leadId: string,
    reason: string,
    respect?: 'stopOnReply' | 'stopOnStageChange' | 'stopOnConvert',
  ) {
    const enrolments = await prisma.sequenceEnrolment.findMany({
      where: { leadId, status: { in: ['ACTIVE', 'HELD'] } },
      include: { sequence: { select: { stopOnReply: true, stopOnStageChange: true, stopOnConvert: true } } },
    });

    const applicable = enrolments.filter((e) => (respect ? e.sequence[respect] : true));
    if (!applicable.length) return { cancelled: 0, messages: 0 };

    const ids = applicable.map((e) => e.id);
    const [, messages] = await prisma.$transaction([
      prisma.sequenceEnrolment.updateMany({
        where: { id: { in: ids } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      }),
      prisma.scheduledMessage.updateMany({
        where: { enrolmentId: { in: ids }, status: 'PENDING' },
        data: { status: 'CANCELLED', skipReason: reason },
      }),
    ]);

    logger.info({ leadId, reason, cancelled: ids.length, messages: messages.count }, 'sequences stopped for lead');
    return { cancelled: ids.length, messages: messages.count };
  },

  // ── Per-lead controls ────────────────────────────────

  /** What the lead detail card shows: sent, queued and what comes next. */
  async forLead(leadId: string) {
    const enrolments = await prisma.sequenceEnrolment.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        sequence: { select: { id: true, name: true, trigger: true } },
        messages: {
          orderBy: { scheduledFor: 'asc' },
          select: {
            id: true,
            status: true,
            subject: true,
            scheduledFor: true,
            sentAt: true,
            skipReason: true,
            lastError: true,
            step: { select: { position: true } },
          },
        },
      },
    });
    return enrolments;
  },

  async pause(enrolmentId: string) {
    const enrolment = await this.getEnrolment(enrolmentId);
    if (enrolment.status !== 'ACTIVE') throw AppError.conflict('Only an active follow-up can be paused');

    // Held, not cancelled: the messages keep their place and can be released.
    await prisma.$transaction([
      prisma.sequenceEnrolment.update({
        where: { id: enrolmentId },
        data: { status: 'HELD', heldAt: new Date(), holdReason: 'paused by staff' },
      }),
      prisma.scheduledMessage.updateMany({
        where: { enrolmentId, status: 'PENDING' },
        // Parked far enough out that the worker will not pick them up; resume
        // restores the original spacing from the enrolment time.
        data: { scheduledFor: new Date('2099-01-01T00:00:00Z') },
      }),
    ]);
    return this.getEnrolment(enrolmentId);
  },

  async resume(enrolmentId: string) {
    const enrolment = await this.getEnrolment(enrolmentId);
    if (enrolment.status !== 'HELD') throw AppError.conflict('This follow-up is not paused');

    const steps = await prisma.sequenceStep.findMany({
      where: { sequenceId: enrolment.sequenceId },
      select: { id: true, delayMinutes: true },
    });
    const base = enrolment.createdAt.getTime();
    const now = Date.now();

    await prisma.sequenceEnrolment.update({
      where: { id: enrolmentId },
      data: { status: 'ACTIVE', releasedAt: new Date(), holdReason: null },
    });

    // A step whose original time has passed goes out now rather than never.
    for (const step of steps) {
      const original = base + step.delayMinutes * 60_000;
      await prisma.scheduledMessage.updateMany({
        where: { enrolmentId, stepId: step.id, status: 'PENDING' },
        data: { scheduledFor: new Date(Math.max(original, now)) },
      });
    }
    return this.getEnrolment(enrolmentId);
  },

  async cancel(enrolmentId: string, reason = 'cancelled by staff') {
    const enrolment = await this.getEnrolment(enrolmentId);
    if (enrolment.status === 'CANCELLED') throw AppError.conflict('This follow-up is already cancelled');
    return this.stopForLead(enrolment.leadId, reason).then(() => this.getEnrolment(enrolmentId));
  },

  /** Skip one queued step without stopping the rest of the ladder. */
  async skipMessage(messageId: string) {
    const updated = await prisma.scheduledMessage.updateMany({
      where: { id: messageId, status: 'PENDING' },
      data: { status: 'CANCELLED', skipReason: 'skipped by staff' },
    });
    if (!updated.count) throw AppError.conflict('That step has already been sent or cancelled');
    return { skipped: true };
  },

  /** Send a queued step now instead of waiting for its slot. */
  async sendNow(messageId: string) {
    const updated = await prisma.scheduledMessage.updateMany({
      where: { id: messageId, status: 'PENDING' },
      data: { scheduledFor: new Date() },
    });
    if (!updated.count) throw AppError.conflict('That step has already been sent or cancelled');
    return { scheduled: true };
  },

  async getEnrolment(id: string) {
    const enrolment = await prisma.sequenceEnrolment.findUnique({ where: { id } });
    if (!enrolment) throw AppError.notFound('Follow-up not found');
    return enrolment;
  },
};
