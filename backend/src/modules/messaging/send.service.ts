import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { buildLeadScope, type AuthContext } from '../leads/leads.scope';
import { outbox, normaliseAddress } from './outbox.service';
import { mergeDataForLead, renderTemplate } from './merge';
import type { SendInput, SendPreviewInput } from './messaging.schema';

// Manual sending: choose leads, choose a template, queue a batch.
//
// Two rules shape this file. Recipients are always resolved through the same
// lead scope the leads list uses, so a rep cannot send to leads they cannot
// see. And nothing is sent inline — a batch is a set of ordinary queued
// messages, so quiet hours, suppression, throttling and the pause switch all
// still apply.

/** A rep without authoring rights can only send to a handful of leads at a
 *  time; marketing and admin can send to a filtered list. */
export const REP_RECIPIENT_CAP = 25;

const leadSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  suburb: true,
  state: true,
  enquiryType: true,
  officeId: true,
  assignedTo: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LeadSelect;

type Recipient = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

export interface Screening {
  willSend: number;
  skipped: { noAddress: number; unsubscribed: number };
  total: number;
}

function filtersToWhere(filters: SendPreviewInput['filters']): Prisma.LeadWhereInput {
  if (!filters) return {};
  return {
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.enquiryType ? { enquiryType: filters.enquiryType } : {}),
    ...(filters.leadSourceId ? { leadSourceId: filters.leadSourceId } : {}),
    ...(filters.assignedToId ? { assignedToId: filters.assignedToId } : {}),
    ...(filters.search
      ? {
          OR: [
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

export const sendService = {
  /** Resolve the audience, always inside the caller's own lead scope. */
  async resolveRecipients(auth: AuthContext, input: SendPreviewInput): Promise<Recipient[]> {
    if (!input.leadIds?.length && !input.filters) {
      throw AppError.badRequest('Choose some leads, or a filter, to send to');
    }
    const where: Prisma.LeadWhereInput = {
      ...buildLeadScope(auth),
      ...(input.leadIds?.length ? { id: { in: input.leadIds } } : filtersToWhere(input.filters)),
    };
    // Ordered so the preview is deterministic: the sample recipient shown on
    // the confirm screen is the same one every time for the same selection.
    // Hard ceiling regardless of role: a single send should never be unbounded.
    return prisma.lead.findMany({ where, select: leadSelect, orderBy: { createdAt: 'asc' }, take: 2000 });
  },

  /** Which of these leads would actually receive the message, and why not. */
  async screen(recipients: Recipient[]): Promise<{ screening: Screening; sendable: Recipient[] }> {
    const withEmail = recipients.filter((r) => r.email);
    const addresses = withEmail.map((r) => normaliseAddress('EMAIL', r.email!));

    const suppressed = addresses.length
      ? await prisma.messageSuppression.findMany({
          where: { channel: 'EMAIL', address: { in: addresses } },
          select: { address: true },
        })
      : [];
    const blocked = new Set(suppressed.map((s) => s.address));
    const sendable = withEmail.filter((r) => !blocked.has(normaliseAddress('EMAIL', r.email!)));

    return {
      screening: {
        total: recipients.length,
        willSend: sendable.length,
        skipped: {
          noAddress: recipients.length - withEmail.length,
          unsubscribed: withEmail.length - sendable.length,
        },
      },
      sendable,
    };
  },

  async loadTemplate(templateId: string) {
    const template = await prisma.messageTemplate.findFirst({
      where: { id: templateId, deletedAt: null },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!template) throw AppError.notFound('Template not found');
    if (!template.isActive) throw AppError.badRequest('This template is archived — reactivate it before sending');
    return template;
  },

  /**
   * The confirm screen's data: who is included, who was dropped and why, and
   * the message as the first recipient will actually see it.
   */
  async preview(auth: AuthContext, input: SendPreviewInput) {
    const template = await this.loadTemplate(input.templateId);
    const recipients = await this.resolveRecipients(auth, input);
    const { screening, sendable } = await this.screen(recipients);

    const first = sendable[0];
    const merge = first ? mergeDataForLead(first) : {};
    return {
      template: { id: template.id, name: template.name, category: template.category },
      screening,
      cap: this.capFor(auth),
      sample: first
        ? {
            to: first.email,
            leadName: `${first.firstName} ${first.lastName}`.trim(),
            subject: renderTemplate(template.subject ?? '', merge, { escape: false }),
            bodyHtml: renderTemplate(template.bodyHtml, merge),
          }
        : null,
    };
  },

  capFor(auth: AuthContext): number | null {
    return auth.permissions.includes('messaging.write') || auth.permissions.includes('*.*')
      ? null
      : REP_RECIPIENT_CAP;
  },

  /**
   * Queue the batch. Each recipient becomes an ordinary scheduled message with
   * its own idempotency key, so re-submitting the same batch cannot double-send
   * and a partial failure can be retried safely.
   */
  async send(auth: AuthContext, input: SendInput) {
    const template = await this.loadTemplate(input.templateId);
    const recipients = await this.resolveRecipients(auth, input);
    const { screening, sendable } = await this.screen(recipients);

    const cap = this.capFor(auth);
    if (cap !== null && screening.willSend > cap) {
      throw AppError.badRequest(
        `You can send to at most ${cap} leads at once. ${screening.willSend} are selected — narrow the selection, or ask a manager to send it.`,
      );
    }
    if (!sendable.length) {
      throw AppError.badRequest('Nobody in this selection can be emailed — check the skipped counts');
    }

    const version = template.versions[0];
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : new Date();

    const batch = await prisma.sendBatch.create({
      data: {
        name: input.name ?? template.name,
        templateId: template.id,
        channel: 'EMAIL',
        totalCount: sendable.length,
        skippedCount: screening.skipped.noAddress + screening.skipped.unsubscribed,
        skipReasons: screening.skipped as unknown as Prisma.InputJsonValue,
        scheduledFor,
        createdById: auth.userId,
      },
      select: { id: true },
    });

    let queued = 0;
    let duplicates = 0;
    for (const lead of sendable) {
      const outcome = await outbox.enqueue({
        channel: 'EMAIL',
        leadId: lead.id,
        batchId: batch.id,
        templateId: template.id,
        templateVersionId: version?.id ?? null,
        toEmail: lead.email,
        mergeData: mergeDataForLead(lead),
        scheduledFor,
        officeId: lead.officeId,
        // Stable per batch and recipient: pressing send twice on the same batch
        // cannot produce two emails.
        idempotencyKey: `batch:${batch.id}:${lead.id}`,
      });
      if (outcome.status === 'queued') queued += 1;
      else if (outcome.status === 'duplicate') duplicates += 1;
    }

    // The count written before queueing was optimistic; correct it.
    if (queued !== sendable.length) {
      await prisma.sendBatch.update({ where: { id: batch.id }, data: { totalCount: queued } });
    }

    return { batchId: batch.id, queued, duplicates, skipped: screening.skipped, scheduledFor };
  },

  /** Send one message to the signed-in user, to check how a template looks. */
  async testSend(auth: AuthContext, templateId: string) {
    const template = await this.loadTemplate(templateId);
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user?.email) throw AppError.badRequest('Your account has no email address');

    const outcome = await outbox.enqueue({
      channel: 'EMAIL',
      templateId: template.id,
      templateVersionId: template.versions[0]?.id ?? null,
      toEmail: user.email,
      mergeData: mergeDataForLead({
        firstName: user.firstName,
        lastName: user.lastName,
        suburb: null,
        state: null,
        enquiryType: null,
        assignedTo: null,
      }),
      // A test the operator is watching for should not wait until 8am.
      ignoreWindow: true,
      idempotencyKey: `test:${template.id}:${auth.userId}:${Date.now()}`,
    });

    if (outcome.status === 'skipped') {
      throw AppError.badRequest(
        outcome.reason === 'suppressed'
          ? 'Your own address is on the unsubscribe list'
          : 'Your account has no email address',
      );
    }
    return { messageId: outcome.messageId, to: user.email };
  },
};
