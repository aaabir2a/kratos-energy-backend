import { prisma } from '../../core/database/prisma';
import { env } from '../../core/config/env';
import { logger } from '../../core/logger/logger';
import { looksMachine } from './tracking';

/**
 * Where a tracking link points.
 *
 * Falls back to the CRM origin plus the API prefix rather than needing its own
 * setting: both the production host and the dev server proxy /api to this
 * service, so the derived URL resolves in either. Set PUBLIC_API_BASE_URL to
 * point straight at the API host instead.
 */
export function trackingBaseUrl(): string {
  if (env.PUBLIC_API_BASE_URL) return env.PUBLIC_API_BASE_URL.replace(/\/$/, '');
  if (!env.APP_BASE_URL) return '';
  return `${env.APP_BASE_URL.replace(/\/$/, '')}${env.API_PREFIX}`;
}

/**
 * A mail client can request the same pixel several times for one viewing —
 * scrolling back, a reading pane redrawing, an image cache miss. Anything
 * inside this window is the same view, not a second one.
 */
const DEDUPE_MS = 60_000;

async function recentlyRecorded(
  messageId: string,
  type: 'OPENED' | 'CLICKED',
  machine: boolean,
  url: string | null,
): Promise<boolean> {
  const since = new Date(Date.now() - DEDUPE_MS);
  const found = await prisma.messageEvent.findFirst({
    where: { messageId, type, machine, occurredAt: { gte: since }, ...(url ? { url } : {}) },
    select: { id: true },
  });
  return found !== null;
}

export const trackingService = {
  /**
   * Records an open. Returns quietly for a message that no longer exists — the
   * pixel still has to answer with an image either way, and a deleted lead
   * should not produce an error in the log every time an old mail is reopened.
   */
  async recordOpen(messageId: string, userAgent: string | undefined): Promise<void> {
    const message = await prisma.scheduledMessage.findUnique({
      where: { id: messageId },
      select: { id: true, sentAt: true },
    });
    if (!message) return;

    const { machine, reason } = looksMachine(userAgent, message.sentAt);
    if (await recentlyRecorded(messageId, 'OPENED', machine, null)) return;

    await prisma.messageEvent.create({
      data: {
        messageId,
        type: 'OPENED',
        machine,
        detail: reason ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });
  },

  /** Records a click. The redirect happens whether or not this succeeds. */
  async recordClick(messageId: string, url: string, userAgent: string | undefined): Promise<void> {
    const message = await prisma.scheduledMessage.findUnique({
      where: { id: messageId },
      select: { id: true, sentAt: true },
    });
    if (!message) return;

    // A click is a stronger signal than an open, but a security gateway that
    // follows every link produces them too, so the same test applies.
    const { machine, reason } = looksMachine(userAgent, message.sentAt);
    if (await recentlyRecorded(messageId, 'CLICKED', machine, url)) return;

    await prisma.messageEvent.create({
      data: {
        messageId,
        type: 'CLICKED',
        machine,
        url: url.slice(0, 2000),
        detail: reason ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
    });

    // Someone who clicks has demonstrably seen the message, and some clients
    // block images while following links. Backfill the open so the funnel is
    // not left with more clicks than opens.
    const opened = await prisma.messageEvent.findFirst({
      where: { messageId, type: 'OPENED', machine: false },
      select: { id: true },
    });
    if (!opened && !machine) {
      await prisma.messageEvent.create({
        data: { messageId, type: 'OPENED', machine: false, detail: 'implied by click' },
      });
    }
  },

  /** Everything that happened to one recipient's messages, newest first. */
  async historyFor(where: { leadId?: string; contactId?: string }, limit = 50) {
    const messages = await prisma.scheduledMessage.findMany({
      where: {
        ...(where.leadId ? { leadId: where.leadId } : {}),
        ...(where.contactId ? { contactId: where.contactId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        subject: true,
        status: true,
        toEmail: true,
        scheduledFor: true,
        sentAt: true,
        skipReason: true,
        lastError: true,
        template: { select: { id: true, name: true } },
        events: {
          orderBy: { occurredAt: 'asc' },
          select: { type: true, machine: true, url: true, detail: true, occurredAt: true },
        },
      },
    });

    return messages.map((m) => {
      // Only human events count towards "did this land with a person".
      const human = m.events.filter((e) => !e.machine);
      return {
        ...m,
        openedAt: human.find((e) => e.type === 'OPENED')?.occurredAt ?? null,
        clickedAt: human.find((e) => e.type === 'CLICKED')?.occurredAt ?? null,
        clickedUrls: [...new Set(human.filter((e) => e.type === 'CLICKED' && e.url).map((e) => e.url!))],
        bounced: m.events.some((e) => e.type === 'BOUNCED'),
        machineOnly: human.length === 0 && m.events.some((e) => e.type === 'OPENED'),
      };
    });
  },
};

/** Fire-and-forget wrapper: tracking must never delay the pixel or the redirect. */
export function recordInBackground(work: Promise<unknown>, what: string): void {
  void work.catch((err) => logger.error({ err: (err as Error).message, what }, 'tracking write failed'));
}
