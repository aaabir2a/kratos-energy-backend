import { Prisma, type CampaignStatus } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../shared/errors/AppError';
import { outbox, normaliseAddress } from '../messaging/outbox.service';
import { renderTemplate, type MergeData } from '../messaging/merge';
import type { CreateCampaignInput, UpdateCampaignInput } from './marketing.schema';

// A campaign is a template, one or more lists and a time.
//
// It exists as a draft before it has recipients, which is why it is its own
// record rather than a SendBatch — but sending one creates a batch, and from
// that point the outbox, the worker, quiet hours, the throttle and the pause
// switch all treat its messages like any other.

const campaignInclude = {
  template: { select: { id: true, name: true, subject: true, isActive: true } },
  lists: { include: { list: { select: { id: true, name: true } } } },
} satisfies Prisma.EmailCampaignInclude;

/** Statuses a campaign can still be edited or sent from. */
const EDITABLE: CampaignStatus[] = ['DRAFT', 'SCHEDULED'];

export interface CampaignScreening {
  total: number;
  willSend: number;
  skipped: { noAddress: number; unsubscribed: number; duplicate: number };
}

interface Recipient {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

/** Merge data for a contact. Only the standard fields for now — see the note
 *  on custom columns in resolveAudience. */
function mergeDataForContact(contact: Recipient): MergeData {
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return {
    firstName: contact.firstName ?? undefined,
    lastName: contact.lastName ?? undefined,
    fullName: fullName || undefined,
  };
}

export const campaignService = {
  // ── Reading ────────────────────────────────────────

  async list(params: { skip: number; limit: number; status?: CampaignStatus }) {
    const where: Prisma.EmailCampaignWhereInput = {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        include: campaignInclude,
      }),
      prisma.emailCampaign.count({ where }),
    ]);
    // A campaign in flight may have finished since it was last read.
    const refreshed = await Promise.all(items.map((c) => this.refreshProgress(c)));
    return { items: refreshed, total };
  },

  async get(id: string) {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id, deletedAt: null },
      include: campaignInclude,
    });
    if (!campaign) throw AppError.notFound('Campaign not found');
    return this.refreshProgress(campaign);
  },

  /**
   * Progress comes from the messages themselves rather than a counter, so it
   * cannot drift. A campaign whose queue has drained is marked sent here —
   * there is no separate job to fall behind.
   */
  async refreshProgress<T extends { id: string; status: CampaignStatus; batchId: string | null }>(campaign: T) {
    if (!campaign.batchId || (campaign.status !== 'SENDING' && campaign.status !== 'SCHEDULED')) {
      return { ...campaign, progress: null };
    }

    const grouped = await prisma.scheduledMessage.groupBy({
      by: ['status'],
      where: { batchId: campaign.batchId },
      _count: { _all: true },
    });
    const count = (status: string) => grouped.find((g) => g.status === status)?._count._all ?? 0;
    const progress = {
      pending: count('PENDING'),
      sent: count('SENT'),
      failed: count('FAILED'),
      skipped: count('SKIPPED'),
      cancelled: count('CANCELLED'),
    };

    const done = progress.pending === 0 && grouped.length > 0;
    if (done) {
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'SENT', completedAt: new Date() },
      });
      return { ...campaign, status: 'SENT' as CampaignStatus, progress };
    }

    // Anything actually sent means it is under way, not merely scheduled.
    if (campaign.status === 'SCHEDULED' && progress.sent > 0) {
      await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } });
      return { ...campaign, status: 'SENDING' as CampaignStatus, progress };
    }

    return { ...campaign, progress };
  },

  // ── Authoring ──────────────────────────────────────

  async create(input: CreateCampaignInput, userId: string) {
    const campaign = await prisma.emailCampaign.create({
      data: {
        name: input.name,
        templateId: input.templateId ?? null,
        createdById: userId,
        lists: input.listIds?.length
          ? { create: input.listIds.map((listId) => ({ listId })) }
          : undefined,
      },
      include: campaignInclude,
    });
    return { ...campaign, progress: null };
  },

  async update(id: string, input: UpdateCampaignInput) {
    const campaign = await this.get(id);
    if (!EDITABLE.includes(campaign.status)) {
      throw AppError.conflict(`A campaign that is ${campaign.status.toLowerCase()} cannot be edited`);
    }

    // Lists are replaced wholesale rather than patched, so the set on screen
    // is exactly the set that gets saved.
    if (input.listIds) {
      await prisma.emailCampaignList.deleteMany({ where: { campaignId: id } });
      if (input.listIds.length) {
        await prisma.emailCampaignList.createMany({
          data: input.listIds.map((listId) => ({ campaignId: id, listId })),
        });
      }
    }

    await prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
      },
    });
    return this.get(id);
  },

  async remove(id: string) {
    const campaign = await this.get(id);
    if (campaign.status === 'SENDING') {
      throw AppError.conflict('Cancel this campaign before deleting it');
    }
    return prisma.emailCampaign.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  // ── Audience ───────────────────────────────────────

  /**
   * Everyone on the campaign's lists who can actually be emailed.
   *
   * Note on custom columns: a contact's imported fields are stored, but
   * templates cannot reference them yet — the template editor validates merge
   * fields at save time against a fixed catalogue, and a template is not tied
   * to a list. Standard fields work; per-list fields are a later addition.
   */
  async resolveAudience(campaignId: string): Promise<{ screening: CampaignScreening; sendable: Recipient[] }> {
    const links = await prisma.emailCampaignList.findMany({
      where: { campaignId },
      select: { listId: true },
    });
    if (!links.length) {
      return { screening: { total: 0, willSend: 0, skipped: { noAddress: 0, unsubscribed: 0, duplicate: 0 } }, sendable: [] };
    }

    const members = await prisma.contactListMember.findMany({
      where: { listId: { in: links.map((l) => l.listId) } },
      select: {
        contact: { select: { id: true, email: true, firstName: true, lastName: true, deletedAt: true } },
      },
    });

    // The same person on two of the campaign's lists is one recipient.
    const byId = new Map<string, Recipient>();
    let removed = 0;
    let duplicate = 0;
    for (const member of members) {
      const c = member.contact;
      if (c.deletedAt) { removed += 1; continue; }
      if (byId.has(c.id)) { duplicate += 1; continue; }
      byId.set(c.id, { id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName });
    }

    const unique = [...byId.values()];
    const withAddress = unique.filter((c) => c.email);

    const blocked = withAddress.length
      ? await prisma.messageSuppression.findMany({
          where: { channel: 'EMAIL', address: { in: withAddress.map((c) => normaliseAddress('EMAIL', c.email)) } },
          select: { address: true },
        })
      : [];
    const blockedSet = new Set(blocked.map((b) => b.address));
    const sendable = withAddress.filter((c) => !blockedSet.has(normaliseAddress('EMAIL', c.email)));

    return {
      screening: {
        total: members.length,
        willSend: sendable.length,
        skipped: {
          noAddress: unique.length - withAddress.length + removed,
          unsubscribed: withAddress.length - sendable.length,
          duplicate,
        },
      },
      sendable,
    };
  },

  /** The confirm screen's data: who is in, who is out, and one rendered sample. */
  async preview(id: string) {
    const campaign = await this.get(id);
    if (!campaign.template) throw AppError.badRequest('Choose a template before previewing');

    const { screening, sendable } = await this.resolveAudience(id);
    const first = sendable[0];
    const merge = first ? mergeDataForContact(first) : {};

    const template = await prisma.messageTemplate.findUnique({ where: { id: campaign.template.id } });
    return {
      campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
      template: { id: campaign.template.id, name: campaign.template.name },
      screening,
      sample: first
        ? {
            to: first.email,
            name: [first.firstName, first.lastName].filter(Boolean).join(' ') || first.email,
            subject: renderTemplate(template?.subject ?? '', merge, { escape: false }),
            bodyHtml: renderTemplate(template?.bodyHtml ?? '', merge),
          }
        : null,
    };
  },

  // ── Sending ────────────────────────────────────────

  /**
   * Queue the campaign. One message per recipient, keyed on campaign and
   * contact, so pressing send twice cannot produce two emails.
   */
  async send(id: string, userId: string, scheduledFor?: string) {
    const campaign = await this.get(id);
    if (!EDITABLE.includes(campaign.status)) {
      throw AppError.conflict(`This campaign is already ${campaign.status.toLowerCase()}`);
    }
    if (!campaign.templateId || !campaign.template) {
      throw AppError.badRequest('Choose a template before sending');
    }
    if (!campaign.template.isActive) {
      throw AppError.badRequest('That template is archived — reactivate it or pick another');
    }

    const { screening, sendable } = await this.resolveAudience(id);
    if (!sendable.length) {
      throw AppError.badRequest('Nobody on these lists can be emailed — check the skipped counts');
    }

    const when = scheduledFor ? new Date(scheduledFor) : new Date();
    const template = await prisma.messageTemplate.findUnique({
      where: { id: campaign.templateId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    const batch = await prisma.sendBatch.create({
      data: {
        name: campaign.name,
        templateId: campaign.templateId,
        channel: 'EMAIL',
        totalCount: sendable.length,
        skippedCount: screening.skipped.noAddress + screening.skipped.unsubscribed,
        skipReasons: screening.skipped as unknown as Prisma.InputJsonValue,
        scheduledFor: when,
        createdById: userId,
      },
      select: { id: true },
    });

    let queued = 0;
    for (const contact of sendable) {
      const outcome = await outbox.enqueue({
        channel: 'EMAIL',
        contactId: contact.id,
        batchId: batch.id,
        templateId: campaign.templateId,
        templateVersionId: template?.versions[0]?.id ?? null,
        toEmail: contact.email,
        mergeData: mergeDataForContact(contact),
        scheduledFor: when,
        idempotencyKey: `campaign:${id}:${contact.id}`,
      });
      if (outcome.status === 'queued') queued += 1;
    }

    const future = when.getTime() > Date.now() + 60_000;
    const updated = await prisma.emailCampaign.update({
      where: { id },
      data: {
        status: future ? 'SCHEDULED' : 'SENDING',
        batchId: batch.id,
        scheduledFor: when,
        startedAt: future ? null : new Date(),
        recipientCount: queued,
        skippedCount: screening.skipped.noAddress + screening.skipped.unsubscribed,
        skipReasons: screening.skipped as unknown as Prisma.InputJsonValue,
      },
      include: campaignInclude,
    });

    logger.info({ campaignId: id, queued, scheduledFor: when }, 'campaign queued');
    return { ...updated, queued, skipped: screening.skipped };
  },

  /** Stop everything still queued. What has already gone stays recorded. */
  async cancel(id: string) {
    const campaign = await this.get(id);
    if (campaign.status !== 'SENDING' && campaign.status !== 'SCHEDULED') {
      throw AppError.conflict(`A campaign that is ${campaign.status.toLowerCase()} cannot be cancelled`);
    }

    const cancelled = campaign.batchId ? await outbox.cancelBatch(campaign.batchId) : 0;
    await prisma.emailCampaign.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    return { cancelled };
  },
};
