import { Router, type Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok } from '../../shared/utils/response';
import { audit } from '../../shared/utils/audit';
import { AppError } from '../../shared/errors/AppError';
import { env } from '../../core/config/env';
import { logger } from '../../core/logger/logger';
import { prisma } from '../../core/database/prisma';
import { chatbotService } from './chatbot.service';

async function agentFirstName(userId: string): Promise<string> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true } });
  return me?.firstName ?? 'Agent';
}

const idParam = z.object({ id: z.string().uuid() });

// ── Webhook receiver (platform → us). HMAC-verified, no session auth. ──
export const chatbotWebhookRouter = Router();

function verifySignature(req: Request): boolean {
  const secret = env.CHATBOT_WEBHOOK_SECRET;
  if (!secret) return false; // not configured → reject everything
  const raw = (req as { rawBody?: Buffer }).rawBody;
  const header = req.header('x-webhook-signature') ?? '';
  if (!raw || !header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

chatbotWebhookRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (!verifySignature(req)) {
      throw AppError.unauthorized('Invalid webhook signature');
    }
    const event = req.header('x-webhook-event') ?? String(req.body?.event ?? '');
    // Respond fast; the handler work here is light (DB writes only).
    await chatbotService.handleEvent(event, (req.body?.data ?? {}) as Record<string, unknown>);
    logger.info({ event }, 'Chatbot webhook processed');
    ok(res, { received: true });
  }),
);

// ── Staff API (Chat Inbox UI) ──
export const chatbotRouter = Router();
chatbotRouter.use(authenticate);

chatbotRouter.get(
  '/status',
  requirePermission('leads.read'),
  asyncHandler(async (_req, res) =>
    ok(res, { configured: chatbotService.configured(), apiBase: env.CHATBOT_API_BASE }),
  ),
);

chatbotRouter.get(
  '/conversations',
  requirePermission('leads.read'),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await chatbotService.listConversations({
        waiting: req.query.waiting === 'true',
        leadId: req.query.leadId as string | undefined,
        search: req.query.search as string | undefined,
      }),
    ),
  ),
);

chatbotRouter.get(
  '/conversations/:id',
  requirePermission('leads.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await chatbotService.getConversation(req.params.id))),
);

chatbotRouter.post(
  '/conversations/:id/refresh',
  requirePermission('leads.read'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => ok(res, await chatbotService.refreshTranscript(req.params.id))),
);

chatbotRouter.post(
  '/sync',
  requirePermission('leads.read'),
  asyncHandler(async (req, res) => ok(res, await chatbotService.sync(req.query.full === 'true'))),
);

chatbotRouter.post(
  '/conversations/:id/takeover',
  requirePermission('activities.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    // Agent name shown to the visitor = the logged-in user's first name.
    const conv = await chatbotService.takeover(req.params.id, await agentFirstName(req.auth!.userId));
    await audit({ userId: req.auth?.userId, action: 'chat.takeover', entityType: 'chat_conversation', entityId: req.params.id, ip: req.ip });
    ok(res, conv);
  }),
);

chatbotRouter.post(
  '/conversations/:id/reply',
  requirePermission('activities.write'),
  validate({ params: idParam, body: z.object({ text: z.string().min(1).max(4000) }) }),
  asyncHandler(async (req, res) => {
    ok(res, await chatbotService.reply(req.params.id, req.body.text, await agentFirstName(req.auth!.userId)));
  }),
);

chatbotRouter.post(
  '/conversations/:id/release',
  requirePermission('activities.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const conv = await chatbotService.release(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'chat.release', entityType: 'chat_conversation', entityId: req.params.id, ip: req.ip });
    ok(res, conv);
  }),
);

chatbotRouter.post(
  '/leads/:id/contacted',
  requirePermission('leads.write'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await chatbotService.markLeadContacted(req.params.id));
  }),
);
