import { createHash } from 'node:crypto';
import { Prisma, type MessageChannel } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { messagingSettings } from './messaging.settings';
import { nextAllowedTime } from './timing';
import type { MergeData } from './merge';

// The enqueue side of the outbox. Everything that wants to send a message —
// a sequence step, a bulk batch, a one-off from a lead page — comes through
// here, so suppression, quiet hours and idempotency are applied once rather
// than re-implemented per feature.

export interface EnqueueInput {
  channel?: MessageChannel;
  leadId?: string | null;
  dealId?: string | null;
  enrolmentId?: string | null;
  stepId?: string | null;
  batchId?: string | null;
  templateId?: string | null;
  templateVersionId?: string | null;
  toEmail?: string | null;
  toPhone?: string | null;
  mergeData?: MergeData;
  /** When the message should go out, before quiet hours are applied. */
  scheduledFor?: Date;
  /** Overrides the derived key. Callers with a natural key (enrolment+step,
   *  batch+recipient) should pass one so a retry cannot double-send. */
  idempotencyKey?: string;
  /** Skip the office/global sending window — used for a test send the
   *  operator is watching for. */
  ignoreWindow?: boolean;
  officeId?: string | null;
}

export type EnqueueOutcome =
  | { status: 'queued'; messageId: string; scheduledFor: Date }
  | { status: 'duplicate'; messageId: string }
  | { status: 'skipped'; reason: SkipReason };

export type SkipReason = 'no_address' | 'suppressed';

/** Stable key for a message, so the same logical send is only ever queued once. */
export function idempotencyKeyFor(input: EnqueueInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;
  const parts = [
    input.channel ?? 'EMAIL',
    input.enrolmentId ?? '',
    input.stepId ?? '',
    input.batchId ?? '',
    input.leadId ?? '',
    input.toEmail ?? input.toPhone ?? '',
    // Without the template a resend of different copy would collide with the
    // original and be silently swallowed as a duplicate.
    input.templateId ?? '',
    input.scheduledFor ? String(input.scheduledFor.getTime()) : 'now',
  ].join('|');
  return createHash('sha1').update(parts).digest('hex');
}

export function normaliseAddress(channel: MessageChannel, address: string): string {
  return channel === 'EMAIL' ? address.trim().toLowerCase() : address.replace(/[\s()-]/g, '');
}

export const outbox = {
  /** Is this address on the do-not-contact list? */
  async isSuppressed(channel: MessageChannel, address: string): Promise<boolean> {
    const row = await prisma.messageSuppression.findUnique({
      where: { channel_address: { channel, address: normaliseAddress(channel, address) } },
    });
    return row !== null;
  },

  /**
   * Queue one message. Never sends inline — the worker does that — so the
   * caller's request stays fast and everything obeys the same rules.
   */
  async enqueue(input: EnqueueInput): Promise<EnqueueOutcome> {
    const channel = input.channel ?? 'EMAIL';
    const address = channel === 'EMAIL' ? input.toEmail : input.toPhone;

    if (!address) return { status: 'skipped', reason: 'no_address' };
    if (await this.isSuppressed(channel, address)) return { status: 'skipped', reason: 'suppressed' };

    const desired = input.scheduledFor ?? new Date();
    const scheduledFor = input.ignoreWindow
      ? desired
      : nextAllowedTime(desired, await messagingSettings.windowForOffice(input.officeId));

    const idempotencyKey = idempotencyKeyFor({ ...input, channel, scheduledFor: input.scheduledFor });

    try {
      const message = await prisma.scheduledMessage.create({
        data: {
          channel,
          idempotencyKey,
          leadId: input.leadId ?? null,
          dealId: input.dealId ?? null,
          enrolmentId: input.enrolmentId ?? null,
          stepId: input.stepId ?? null,
          batchId: input.batchId ?? null,
          templateId: input.templateId ?? null,
          templateVersionId: input.templateVersionId ?? null,
          toEmail: channel === 'EMAIL' ? normaliseAddress(channel, address) : null,
          toPhone: channel === 'SMS' ? normaliseAddress(channel, address) : null,
          mergeData: (input.mergeData ?? {}) as Prisma.InputJsonValue,
          scheduledFor,
        },
        select: { id: true, scheduledFor: true },
      });
      await prisma.messageEvent.create({ data: { messageId: message.id, type: 'QUEUED' } });
      return { status: 'queued', messageId: message.id, scheduledFor: message.scheduledFor };
    } catch (err) {
      // Unique violation on idempotency_key: this exact message is already
      // queued. That is the guarantee working, not an error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.scheduledMessage.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        logger.debug({ idempotencyKey }, 'enqueue skipped — already queued');
        return { status: 'duplicate', messageId: existing?.id ?? '' };
      }
      throw err;
    }
  },

  /** Cancel one pending message. Anything already sent is left alone. */
  async cancel(id: string, reason = 'cancelled by operator'): Promise<boolean> {
    const result = await prisma.scheduledMessage.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED', skipReason: reason },
    });
    return result.count > 0;
  },

  /** Cancel everything still pending in a batch — the "stop the send" button. */
  async cancelBatch(batchId: string): Promise<number> {
    const result = await prisma.scheduledMessage.updateMany({
      where: { batchId, status: 'PENDING' },
      data: { status: 'CANCELLED', skipReason: 'batch cancelled' },
    });
    await prisma.sendBatch.update({ where: { id: batchId }, data: { cancelledAt: new Date() } });
    return result.count;
  },

  /** Cancel every pending message for a lead — what a stop rule calls. */
  async cancelForLead(leadId: string, reason: string): Promise<number> {
    const result = await prisma.scheduledMessage.updateMany({
      where: { leadId, status: 'PENDING' },
      data: { status: 'CANCELLED', skipReason: reason },
    });
    return result.count;
  },

  async suppress(
    channel: MessageChannel,
    address: string,
    reason: 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED' | 'MANUAL',
    leadId?: string | null,
  ) {
    const normalised = normaliseAddress(channel, address);
    const suppression = await prisma.messageSuppression.upsert({
      where: { channel_address: { channel, address: normalised } },
      update: { reason, leadId: leadId ?? null },
      create: { channel, address: normalised, reason, leadId: leadId ?? null },
    });
    // A suppression that left queued messages behind would still send.
    const field = channel === 'EMAIL' ? { toEmail: normalised } : { toPhone: normalised };
    await prisma.scheduledMessage.updateMany({
      where: { ...field, status: 'PENDING' },
      data: { status: 'SKIPPED', skipReason: `suppressed: ${reason.toLowerCase()}` },
    });
    return suppression;
  },
};
