import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { buildMeta } from '../../shared/utils/pagination';
import { leadsRepository } from './leads.repository';
import { buildLeadScope, type AuthContext } from './leads.scope';
import { pickRoundRobinAssignee } from './assignment.service';

type LeadDetail = NonNullable<Awaited<ReturnType<typeof leadsRepository.findById>>>;

async function getDefaultStageId(): Promise<string | null> {
  const stage =
    (await prisma.pipelineStage.findFirst({ where: { track: 'LEAD', isDefault: true } })) ??
    (await prisma.pipelineStage.findFirst({ where: { track: 'LEAD' }, orderBy: { order: 'asc' } }));
  return stage?.id ?? null;
}

function assertVisible(auth: AuthContext, lead: LeadDetail): void {
  if (auth.role === 'sales' && lead.assignedToId !== auth.userId) {
    throw AppError.forbidden('This lead is not assigned to you');
  }
  if (auth.role === 'manager' && auth.officeId && lead.officeId && lead.officeId !== auth.officeId) {
    throw AppError.forbidden('This lead belongs to another office');
  }
}

export const leadsService = {
  async list(
    auth: AuthContext,
    params: {
      page: number;
      limit: number;
      skip: number;
      search?: string;
      stageId?: string;
      status?: 'OPEN' | 'CONVERTED' | 'LOST' | 'JUNK';
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      assignedToId?: string;
      leadSourceId?: string;
      sort?: 'createdAt' | 'score' | 'nextFollowUpAt';
      order?: 'asc' | 'desc';
    },
  ) {
    const where: Prisma.LeadWhereInput = {
      ...buildLeadScope(auth),
      ...(params.stageId ? { stageId: params.stageId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.assignedToId ? { assignedToId: params.assignedToId } : {}),
      ...(params.leadSourceId ? { leadSourceId: params.leadSourceId } : {}),
      ...(params.search
        ? {
            OR: [
              { firstName: { contains: params.search, mode: 'insensitive' } },
              { lastName: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
              { phone: { contains: params.search } },
              { suburb: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.LeadOrderByWithRelationInput = { [params.sort ?? 'createdAt']: params.order ?? 'desc' };
    const [items, total] = await leadsRepository.list(where, orderBy, params.skip, params.limit);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async getById(auth: AuthContext, id: string) {
    const lead = await leadsRepository.findById(id);
    if (!lead) throw AppError.notFound('Lead not found');
    assertVisible(auth, lead);
    return lead;
  },

  async create(
    auth: AuthContext,
    input: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      secondaryPhone?: string;
      addressLine?: string;
      suburb?: string;
      state?: string;
      postcode?: string;
      propertyType?: string;
      roofType?: string;
      estimatedSystemSize?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      leadSourceId?: string;
      officeId?: string;
      leadType?: string;
      consentMarketing?: boolean;
      assignedToId?: string;
      autoAssign?: boolean;
      notes?: string;
    },
  ) {
    const email = input.email ? input.email.toLowerCase() : null;
    const phone = input.phone ?? null;

    // Dedupe on email/phone — surface the existing lead instead of creating a twin.
    const dup = await leadsRepository.findDuplicate(email, phone);
    if (dup) {
      await leadsRepository.addActivity({
        leadId: dup.id,
        userId: auth.userId,
        type: 'SYSTEM',
        subject: 'Duplicate submission',
        body: 'A repeat enquiry was received for this lead.',
      });
      throw AppError.conflict('A lead with this email or phone already exists', { leadId: dup.id });
    }

    const officeId = input.officeId ?? auth.officeId ?? null;
    const stageId = await getDefaultStageId();

    // Resolve assignee: explicit > auto round-robin > unassigned.
    let assignedToId: string | null = input.assignedToId ?? null;
    let method: 'MANUAL' | 'AUTO_ROUND_ROBIN' = 'MANUAL';
    if (!assignedToId && (input.autoAssign ?? true)) {
      assignedToId = await pickRoundRobinAssignee(officeId);
      method = 'AUTO_ROUND_ROBIN';
    }

    const data: Prisma.LeadCreateInput = {
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone,
      secondaryPhone: input.secondaryPhone,
      addressLine: input.addressLine,
      suburb: input.suburb,
      state: input.state,
      postcode: input.postcode,
      propertyType: input.propertyType,
      roofType: input.roofType,
      estimatedSystemSize: input.estimatedSystemSize,
      priority: input.priority ?? 'MEDIUM',
      leadType: input.leadType,
      consentMarketing: input.consentMarketing ?? false,
      ...(officeId ? { office: { connect: { id: officeId } } } : {}),
      ...(input.leadSourceId ? { source: { connect: { id: input.leadSourceId } } } : {}),
      ...(stageId ? { stage: { connect: { id: stageId } } } : {}),
      ...(assignedToId ? { assignedTo: { connect: { id: assignedToId } } } : {}),
      createdBy: { connect: { id: auth.userId } },
    };

    const lead = await leadsRepository.create(data);

    // Trail: creation activity + assignment record.
    await leadsRepository.addActivity({
      leadId: lead.id,
      userId: auth.userId,
      type: 'SYSTEM',
      subject: 'Lead created',
      body: `Lead captured via ${lead.source?.name ?? 'manual entry'}.`,
    });
    if (assignedToId) {
      await leadsRepository.recordAssignment({ leadId: lead.id, assignedToId, assignedById: auth.userId, method });
      await leadsRepository.addActivity({
        leadId: lead.id,
        userId: auth.userId,
        type: 'ASSIGNMENT',
        subject: 'Lead assigned',
        body: method === 'AUTO_ROUND_ROBIN' ? 'Auto-assigned (round-robin).' : 'Manually assigned.',
      });
    }
    if (input.notes) {
      await leadsRepository.addNote({ leadId: lead.id, authorId: auth.userId, body: input.notes });
    }

    return lead;
  },

  async update(auth: AuthContext, id: string, input: Record<string, unknown>) {
    const existing = await this.getById(auth, id);
    const data: Prisma.LeadUpdateInput = {
      ...input,
      ...(input.leadSourceId === null
        ? { source: { disconnect: true } }
        : input.leadSourceId
          ? { source: { connect: { id: input.leadSourceId as string } } }
          : {}),
      ...(input.nextFollowUpAt
        ? { nextFollowUpAt: new Date(input.nextFollowUpAt as string) }
        : input.nextFollowUpAt === null
          ? { nextFollowUpAt: null }
          : {}),
    };
    delete (data as Record<string, unknown>).leadSourceId;
    return leadsRepository.update(existing.id, data);
  },

  async remove(auth: AuthContext, id: string) {
    if (auth.role === 'sales') throw AppError.forbidden('Sales reps cannot delete leads');
    await this.getById(auth, id);
    return leadsRepository.softDelete(id);
  },

  async assign(auth: AuthContext, id: string, assignedToId: string | null, autoAssign?: boolean) {
    const lead = await this.getById(auth, id);
    let target = assignedToId;
    let method: 'MANUAL' | 'AUTO_ROUND_ROBIN' = 'MANUAL';
    if (!target && autoAssign) {
      target = await pickRoundRobinAssignee(lead.officeId);
      method = 'AUTO_ROUND_ROBIN';
      if (!target) throw AppError.badRequest('No active sales reps available to auto-assign');
    }

    const updated = await leadsRepository.update(id, {
      assignedTo: target ? { connect: { id: target } } : { disconnect: true },
    });
    if (target) {
      await leadsRepository.recordAssignment({ leadId: id, assignedToId: target, assignedById: auth.userId, method });
    }
    await leadsRepository.addActivity({
      leadId: id,
      userId: auth.userId,
      type: 'ASSIGNMENT',
      subject: target ? 'Lead reassigned' : 'Lead unassigned',
      body: method === 'AUTO_ROUND_ROBIN' ? 'Auto-assigned (round-robin).' : undefined,
    });
    return updated;
  },

  async moveStage(auth: AuthContext, id: string, stageId: string, reason?: string) {
    const lead = await this.getById(auth, id);
    const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
    if (!stage) throw AppError.notFound('Stage not found');

    const updated = await leadsRepository.update(id, {
      stage: { connect: { id: stageId } },
      ...(stage.isLost ? { status: 'LOST' } : {}),
    });
    await leadsRepository.recordStatusHistory({
      leadId: id,
      fromStageId: lead.stageId,
      toStageId: stageId,
      changedById: auth.userId,
      reason,
    });
    await leadsRepository.addActivity({
      leadId: id,
      userId: auth.userId,
      type: 'STAGE_CHANGE',
      subject: `Moved to ${stage.name}`,
      body: reason,
    });
    return updated;
  },

  async markLost(auth: AuthContext, id: string, lostReason: string) {
    await this.getById(auth, id);
    const updated = await leadsRepository.update(id, { status: 'LOST', lostReason });
    await leadsRepository.addActivity({
      leadId: id,
      userId: auth.userId,
      type: 'SYSTEM',
      subject: 'Lead lost',
      body: lostReason,
    });
    return updated;
  },

  // Notes
  async addNote(auth: AuthContext, id: string, body: string, isPinned?: boolean) {
    await this.getById(auth, id);
    return leadsRepository.addNote({ leadId: id, authorId: auth.userId, body, isPinned: isPinned ?? false });
  },
  async listNotes(auth: AuthContext, id: string) {
    await this.getById(auth, id);
    return leadsRepository.listNotes(id);
  },

  // Activities
  async addActivity(
    auth: AuthContext,
    id: string,
    input: { type: 'CALL' | 'EMAIL' | 'SMS' | 'MEETING' | 'NOTE'; subject?: string; body?: string; occurredAt?: string },
  ) {
    await this.getById(auth, id);
    return leadsRepository.addActivity({
      leadId: id,
      userId: auth.userId,
      type: input.type,
      subject: input.subject,
      body: input.body,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
    });
  },
  async listActivities(auth: AuthContext, id: string) {
    await this.getById(auth, id);
    return leadsRepository.listActivities(id);
  },

  stats(auth: AuthContext) {
    return leadsRepository.stats(buildLeadScope(auth));
  },
};
