import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { sendMail } from '../../core/mail/mailer';
import { emailShell } from '../../core/mail/templates';
import { messagingSettings } from './messaging.settings';
import { retryDelayMs } from './timing';
import { renderTemplate, type MergeData } from './merge';
import { normaliseAddress } from './outbox.service';

// The drain side of the outbox: a plain interval in the API process, not a
// separate service. The database is the queue (see the build plan) — Redis in
// this deployment has persistence switched off, so a queued job there would
// vanish on restart.

const TICK_MS = 60_000;
const CLAIM_LIMIT = 25;
const MAX_ATTEMPTS = 5;

let timer: NodeJS.Timeout | null = null;
let running = false;

export interface TickResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  paused?: boolean;
  throttled?: boolean;
}

/** How many messages went out in the last rolling hour. */
async function sentInLastHour(): Promise<number> {
  return prisma.scheduledMessage.count({
    where: { status: 'SENT', sentAt: { gte: new Date(Date.now() - 60 * 60_000) } },
  });
}

/**
 * Claim due messages atomically.
 *
 * SKIP LOCKED is what makes this safe if the API is ever scaled past one
 * container: a second worker steps over rows the first has locked instead of
 * blocking on them or, worse, sending the same message twice.
 */
async function claim(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE scheduled_messages
       SET status = 'SENDING', claimed_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM scheduled_messages
        WHERE status = 'PENDING' AND scheduled_for <= now()
        ORDER BY scheduled_for ASC
          FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
     )
    RETURNING id
  `);
  return rows.map((r) => r.id);
}

async function markSent(
  id: string,
  providerMessageId: string | undefined,
  lead: { id: string; subject: string } | null,
) {
  await prisma.$transaction([
    prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: providerMessageId ?? null, lastError: null },
    }),
    prisma.messageEvent.create({ data: { messageId: id, type: 'SENT', detail: providerMessageId } }),
    // The rep sees automated mail in the same timeline as their own calls and
    // notes, rather than wondering what the customer has already been sent.
    ...(lead
      ? [
          prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              type: 'EMAIL' as const,
              subject: lead.subject || 'Email sent',
              body: 'Sent automatically by the CRM.',
              metadata: { messageId: id, providerMessageId } as Prisma.InputJsonValue,
            },
          }),
        ]
      : []),
  ]);
}

async function markSkipped(id: string, reason: string) {
  await prisma.scheduledMessage.update({
    where: { id },
    data: { status: 'SKIPPED', skipReason: reason },
  });
}

/** Failure is retried with backoff until MAX_ATTEMPTS, then left FAILED for
 *  someone to look at on the delivery log. */
async function markFailed(id: string, attempts: number, error: string) {
  const giveUp = attempts >= MAX_ATTEMPTS;
  await prisma.$transaction([
    prisma.scheduledMessage.update({
      where: { id },
      data: giveUp
        ? { status: 'FAILED', lastError: error }
        : { status: 'PENDING', lastError: error, scheduledFor: new Date(Date.now() + retryDelayMs(attempts)) },
    }),
    prisma.messageEvent.create({
      data: { messageId: id, type: 'FAILED', detail: giveUp ? `${error} (giving up)` : error },
    }),
  ]);
}

async function deliver(id: string): Promise<'sent' | 'failed' | 'skipped'> {
  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
    include: { template: true, templateVersion: true },
  });
  if (!message) return 'skipped';

  if (message.channel === 'SMS') {
    // The SMS adapter arrives in the final stage; until then a queued SMS is
    // parked rather than silently dropped.
    await markSkipped(id, 'SMS channel not configured yet');
    return 'skipped';
  }

  const address = message.toEmail;
  if (!address) {
    await markSkipped(id, 'no email address');
    return 'skipped';
  }

  // Re-check suppression at send time: someone may have unsubscribed between
  // queueing and now, which for a long sequence could be weeks.
  const suppressed = await prisma.messageSuppression.findUnique({
    where: { channel_address: { channel: 'EMAIL', address: normaliseAddress('EMAIL', address) } },
  });
  if (suppressed) {
    await markSkipped(id, `suppressed: ${suppressed.reason.toLowerCase()}`);
    return 'skipped';
  }

  // The version pinned at queue time wins, so editing a template mid-campaign
  // cannot change what a queued message says.
  const source = message.templateVersion ?? message.template;
  const merge = (message.mergeData ?? {}) as MergeData;
  const subject = message.subject ?? renderTemplate(source?.subject ?? '', merge, { escape: false });
  const bodyHtml = message.bodyHtml ?? renderTemplate(source?.bodyHtml ?? '', merge);
  const bodyText = message.bodyText ?? (source?.bodyText ? renderTemplate(source.bodyText, merge, { escape: false }) : undefined);

  const result = await sendMail({
    to: address,
    subject: subject || '(no subject)',
    html: emailShell(subject || '', [bodyHtml], undefined, {
      footerNote: 'You are receiving this because you enquired with Kratos Sustainability.',
    }),
    text: bodyText,
    entityRef: message.leadId ?? id,
    tag: message.templateId ? `template.${message.templateId}` : 'messaging',
  });

  // Keep what was actually sent, so the log is not a guess.
  await prisma.scheduledMessage.update({
    where: { id },
    data: { subject, bodyHtml, bodyText: bodyText ?? null },
  });

  if (result.ok) {
    await markSent(id, result.messageId, message.leadId ? { id: message.leadId, subject } : null);
    return 'sent';
  }
  await markFailed(id, message.attempts, result.error ?? 'send failed');
  return 'failed';
}

/** One pass of the queue. Exported so it can be triggered by hand and tested. */
export async function tick(): Promise<TickResult> {
  const empty: TickResult = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  const settings = await messagingSettings.getAll();
  if (settings.sendingPaused) return { ...empty, paused: true };

  const remaining = settings.throttlePerHour - (await sentInLastHour());
  if (remaining <= 0) return { ...empty, throttled: true };

  const ids = await claim(Math.min(CLAIM_LIMIT, remaining));
  if (!ids.length) return empty;

  const result: TickResult = { ...empty, claimed: ids.length };
  for (const id of ids) {
    try {
      const outcome = await deliver(id);
      result[outcome === 'sent' ? 'sent' : outcome === 'failed' ? 'failed' : 'skipped'] += 1;
    } catch (err) {
      // A crash mid-delivery must not leave the row stuck in SENDING.
      const message = (err as Error).message;
      const row = await prisma.scheduledMessage.findUnique({ where: { id }, select: { attempts: true } });
      await markFailed(id, row?.attempts ?? MAX_ATTEMPTS, message);
      result.failed += 1;
      logger.error({ err: message, messageId: id }, 'message delivery threw');
    }
  }

  logger.info(result, 'messaging queue drained');
  return result;
}

/**
 * Recover messages left in SENDING by a crash or a redeploy mid-send. They are
 * returned to PENDING rather than resent blindly; the attempt is already
 * counted, so a message that keeps crashing the worker still gives up.
 */
export async function requeueStranded(olderThanMs = 10 * 60_000): Promise<number> {
  const result = await prisma.scheduledMessage.updateMany({
    where: { status: 'SENDING', claimedAt: { lt: new Date(Date.now() - olderThanMs) } },
    data: { status: 'PENDING' },
  });
  if (result.count) logger.warn({ count: result.count }, 'requeued messages stranded in SENDING');
  return result.count;
}

export function startWorker(): void {
  if (timer) return;
  void requeueStranded().catch((err) => logger.error({ err }, 'requeue on boot failed'));
  timer = setInterval(() => {
    // Skip a tick rather than overlap if the previous one is still going.
    if (running) return;
    running = true;
    void tick()
      .catch((err) => logger.error({ err: (err as Error).message }, 'messaging tick failed'))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  // Do not hold the process open on shutdown.
  timer.unref?.();
  logger.info({ everyMs: TICK_MS }, 'Messaging worker started');
}

export function stopWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
