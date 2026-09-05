import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { env } from '../../core/config/env';
import { logger } from '../../core/logger/logger';
import { sendMail } from '../../core/mail/mailer';
import { emailShell } from '../../core/mail/templates';
import { ROLE_SLUGS } from '../../shared/constants/rbac';

const ADMIN_EMAILS_KEY = 'notify.adminEmails';

interface PushInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: 'lead' | 'deal';
  entityId?: string;
}

function appLink(entityType?: string, entityId?: string): string | null {
  if (!env.APP_BASE_URL || !entityType || !entityId) return null;
  const path = entityType === 'deal' ? 'deals' : 'leads';
  return `${env.APP_BASE_URL.replace(/\/$/, '')}/${path}/${entityId}`;
}

async function push(input: PushInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, type: input.type }, 'in-app notification failed');
  }
}

async function activeManagerAdminIds(officeId: string | null): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { role: { slug: ROLE_SLUGS.ADMIN } },
        { role: { slug: ROLE_SLUGS.MANAGER }, ...(officeId ? { officeId } : {}) },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export const notificationService = {
  // ── In-app feed ────────────────────────────────────
  async listForUser(userId: string, params: { unreadOnly?: boolean; skip: number; limit: number }) {
    const where: Prisma.NotificationWhereInput = { userId, ...(params.unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await prisma.$transaction([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: params.skip, take: params.limit }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unread };
  },

  async unreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, readAt: null } });
  },

  async markRead(userId: string, id: string): Promise<void> {
    await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  },

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  },

  // ── Shared-recipient settings ──────────────────────
  async getAdminEmails(): Promise<string[]> {
    const row = await prisma.appSetting.findUnique({ where: { key: ADMIN_EMAILS_KEY } });
    if (row && Array.isArray(row.value)) return (row.value as unknown[]).map(String);
    // Fallback to env until configured in the UI.
    return env.NOTIFY_ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean);
  },

  async setAdminEmails(emails: string[]): Promise<string[]> {
    const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    await prisma.appSetting.upsert({
      where: { key: ADMIN_EMAILS_KEY },
      update: { value: clean as Prisma.InputJsonValue },
      create: { key: ADMIN_EMAILS_KEY, value: clean as Prisma.InputJsonValue },
    });
    return clean;
  },

  // ── Event dispatch (fire-and-forget from services) ──
  async onLeadCreated(lead: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    suburb?: string | null;
    officeId?: string | null;
    channel: string;
  }): Promise<void> {
    const name = `${lead.firstName} ${lead.lastName}`.trim();
    const contact = [lead.email, lead.phone].filter(Boolean).join(' · ');
    const loc = lead.suburb ? ` from ${lead.suburb}` : '';
    const link = appLink('lead', lead.id);

    // In-app for managers/admins.
    const recipients = await activeManagerAdminIds(lead.officeId ?? null);
    await Promise.all(
      recipients.map((userId) =>
        push({ userId, type: 'lead.created', title: `New lead: ${name}`, body: `${contact} — via ${lead.channel}`, entityType: 'lead', entityId: lead.id }),
      ),
    );

    // Email shared inbox(es).
    const adminEmails = await this.getAdminEmails();
    if (adminEmails.length) {
      await sendMail({
        to: adminEmails,
        subject: `New lead: ${name}`,
        html: emailShell(`New lead captured`, [
          `<strong>${name}</strong>${loc} just came in via <strong>${lead.channel}</strong>.`,
          contact ? `Contact: ${contact}` : 'No contact details provided.',
        ], link ? { text: 'View lead', url: link } : undefined),
        entityRef: lead.id,
        tag: 'lead.created',
      });
    }
  },

  async onLeadAssigned(
    lead: { id: string; firstName: string; lastName: string; suburb?: string | null },
    repId: string,
  ): Promise<void> {
    const name = `${lead.firstName} ${lead.lastName}`.trim();
    const rep = await prisma.user.findUnique({ where: { id: repId }, select: { email: true, firstName: true } });
    const link = appLink('lead', lead.id);

    await push({ userId: repId, type: 'lead.assigned', title: `Lead assigned to you: ${name}`, body: lead.suburb ? `From ${lead.suburb}` : undefined, entityType: 'lead', entityId: lead.id });

    if (rep?.email) {
      await sendMail({
        to: rep.email,
        subject: `New lead assigned: ${name}`,
        html: emailShell(`A lead was assigned to you`, [
          `Hi ${rep.firstName},`,
          `<strong>${name}</strong>${lead.suburb ? ` from ${lead.suburb}` : ''} has been assigned to you. Follow up soon.`,
        ], link ? { text: 'Open lead', url: link } : undefined),
        entityRef: lead.id,
        tag: 'lead.assigned',
      });
    }
  },

  async onDealClosed(
    deal: { id: string; dealNumber: number | string; value: number; ownerId: string | null; officeId?: string | null; leadName?: string },
    outcome: 'won' | 'lost',
    reason?: string,
  ): Promise<void> {
    const label = outcome === 'won' ? 'won' : 'lost';
    const amount = `$${Number(deal.value).toLocaleString()}`;
    const link = appLink('deal', deal.id);
    const title = `Deal ${label}: D-${deal.dealNumber} (${amount})`;

    const recipientIds = new Set<string>();
    if (deal.ownerId) recipientIds.add(deal.ownerId);
    for (const id of await activeManagerAdminIds(deal.officeId ?? null)) recipientIds.add(id);

    await Promise.all(
      [...recipientIds].map((userId) =>
        push({ userId, type: `deal.${label}`, title, body: reason, entityType: 'deal', entityId: deal.id }),
      ),
    );

    const emails = (
      await prisma.user.findMany({ where: { id: { in: [...recipientIds] }, deletedAt: null }, select: { email: true } })
    ).map((u) => u.email);
    if (emails.length) {
      await sendMail({
        to: emails,
        subject: title,
        html: emailShell(`Deal ${label}`, [
          `Deal <strong>D-${deal.dealNumber}</strong>${deal.leadName ? ` (${deal.leadName})` : ''} was closed <strong>${label}</strong> at ${amount}.`,
          reason ? `Note: ${reason}` : '',
        ].filter(Boolean), link ? { text: 'View deal', url: link } : undefined),
        entityRef: deal.id,
        tag: `deal.${label.toLowerCase()}`,
      });
    }
  },
};
