import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { outbox } from './outbox.service';
import { messagingSettings } from './messaging.settings';
import { validatedWindowSchema, type ListQueueQuery, type UpdateSettingsInput } from './messaging.schema';

// Read side of the outbox plus the operator actions: cancel, pause, and the
// counts the queue screen leads with.

const queueListSelect = {
  id: true,
  channel: true,
  status: true,
  toEmail: true,
  toPhone: true,
  subject: true,
  scheduledFor: true,
  sentAt: true,
  attempts: true,
  lastError: true,
  skipReason: true,
  providerMessageId: true,
  batchId: true,
  createdAt: true,
  lead: { select: { id: true, firstName: true, lastName: true } },
  template: { select: { id: true, name: true } },
} satisfies Prisma.ScheduledMessageSelect;

export const queueService = {
  async list(params: ListQueueQuery & { skip: number; limit: number }) {
    const where: Prisma.ScheduledMessageWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.leadId ? { leadId: params.leadId } : {}),
      ...(params.dueOnly ? { status: { in: ['PENDING', 'SENDING'] } } : {}),
      ...(params.search
        ? {
            OR: [
              { toEmail: { contains: params.search, mode: 'insensitive' } },
              { subject: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.scheduledMessage.findMany({
        where,
        // Pending first by when they are due; everything else newest first.
        orderBy: params.dueOnly ? { scheduledFor: 'asc' } : { createdAt: 'desc' },
        skip: params.skip,
        take: params.limit,
        select: queueListSelect,
      }),
      prisma.scheduledMessage.count({ where }),
    ]);
    return { items, total };
  },

  /** Header counts for the queue screen. */
  async summary() {
    const [grouped, dueNow, nextUp, settings] = await Promise.all([
      prisma.scheduledMessage.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.scheduledMessage.count({ where: { status: 'PENDING', scheduledFor: { lte: new Date() } } }),
      prisma.scheduledMessage.findFirst({
        where: { status: 'PENDING' },
        orderBy: { scheduledFor: 'asc' },
        select: { scheduledFor: true },
      }),
      messagingSettings.getAll(),
    ]);

    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    const sentLastHour = await prisma.scheduledMessage.count({
      where: { status: 'SENT', sentAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });

    return {
      counts: {
        pending: counts.PENDING ?? 0,
        sending: counts.SENDING ?? 0,
        sent: counts.SENT ?? 0,
        failed: counts.FAILED ?? 0,
        cancelled: counts.CANCELLED ?? 0,
        skipped: counts.SKIPPED ?? 0,
      },
      dueNow,
      nextScheduledFor: nextUp?.scheduledFor ?? null,
      sentLastHour,
      throttlePerHour: settings.throttlePerHour,
      sendingPaused: settings.sendingPaused,
    };
  },

  async get(id: string) {
    const message = await prisma.scheduledMessage.findUnique({
      where: { id },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        lead: { select: { id: true, firstName: true, lastName: true, email: true } },
        template: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
      },
    });
    if (!message) throw AppError.notFound('Message not found');
    return message;
  },

  async cancel(id: string, reason?: string) {
    const cancelled = await outbox.cancel(id, reason ?? 'cancelled by operator');
    if (!cancelled) {
      // Already sent, already cancelled, or gone — say which rather than
      // pretending the cancel worked.
      const current = await prisma.scheduledMessage.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw AppError.notFound('Message not found');
      throw AppError.conflict(`Cannot cancel a message that is ${current.status.toLowerCase()}`);
    }
    return this.get(id);
  },

  async cancelBatch(batchId: string) {
    const batch = await prisma.sendBatch.findUnique({ where: { id: batchId }, select: { id: true } });
    if (!batch) throw AppError.notFound('Batch not found');
    const cancelled = await outbox.cancelBatch(batchId);
    return { batchId, cancelled };
  },

  getSettings() {
    return messagingSettings.getAll();
  },

  async updateSettings(input: UpdateSettingsInput) {
    if (input.sendingWindow) {
      const parsed = validatedWindowSchema.safeParse(input.sendingWindow);
      if (!parsed.success) {
        throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid sending window');
      }
      await messagingSettings.setWindow(input.sendingWindow);
    }
    if (input.sendingPaused !== undefined) await messagingSettings.setPaused(input.sendingPaused);
    if (input.throttlePerHour !== undefined) await messagingSettings.setThrottle(input.throttlePerHour);
    return messagingSettings.getAll();
  },
};
