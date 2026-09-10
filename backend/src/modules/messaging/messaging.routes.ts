import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage, buildMeta } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { messagingService } from './messaging.service';
import { queueService } from './queue.service';
import { sendService } from './send.service';
import { sequenceService } from './sequence.service';
import { tick } from './worker';
import { trackingService } from './tracking.service';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  listQueueQuerySchema,
  updateSettingsSchema,
  cancelSchema,
  sendPreviewSchema,
  sendSchema,
  createSequenceSchema,
  updateSequenceSchema,
  setStepsSchema,
  stopReasonSchema,
  idParamSchema,
} from './messaging.schema';

export const messagingRouter = Router();
messagingRouter.use(authenticate);

// The merge fields the editor offers. Read-only catalogue.
messagingRouter.get(
  '/merge-fields',
  requirePermission('messaging.read'),
  asyncHandler(async (_req, res) => ok(res, messagingService.mergeFields())),
);

messagingRouter.get(
  '/templates',
  requirePermission('messaging.read'),
  validate({ query: listTemplatesQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const query = req.query as unknown as Record<string, never>;
    const { items, total } = await messagingService.listTemplates({ ...query, skip, limit });
    paginated(res, items, buildMeta(page, limit, total));
  }),
);

messagingRouter.post(
  '/templates',
  requirePermission('messaging.write'),
  validate({ body: createTemplateSchema }),
  asyncHandler(async (req, res) =>
    created(res, await messagingService.createTemplate(req.body, req.auth!.userId)),
  ),
);

messagingRouter.get(
  '/templates/:id',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await messagingService.getTemplate(req.params.id))),
);

// Editor preview, rendered with sample data.
messagingRouter.get(
  '/templates/:id/preview',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await messagingService.previewTemplate(req.params.id))),
);

messagingRouter.patch(
  '/templates/:id',
  requirePermission('messaging.write'),
  validate({ params: idParamSchema, body: updateTemplateSchema }),
  asyncHandler(async (req, res) => ok(res, await messagingService.updateTemplate(req.params.id, req.body))),
);

// Soft delete — sent messages still point at this template.
messagingRouter.delete(
  '/templates/:id',
  requirePermission('messaging.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await messagingService.deleteTemplate(req.params.id);
    noContent(res);
  }),
);

// ── Queue and sending rules (Stage 1) ─────────────────

messagingRouter.get(
  '/queue',
  requirePermission('messaging.read'),
  validate({ query: listQueueQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const query = req.query as unknown as Record<string, never>;
    const { items, total } = await queueService.list({ ...query, skip, limit });
    paginated(res, items, buildMeta(page, limit, total));
  }),
);

// Counts for the queue header: due now, next send, throttle headroom.
messagingRouter.get(
  '/queue/summary',
  requirePermission('messaging.read'),
  asyncHandler(async (_req, res) => ok(res, await queueService.summary())),
);

// What one recipient was sent, and what they did with it. A lead's history is
// messaging.read; a marketing contact's is marketing_email.read, so widening
// one does not quietly widen the other.
messagingRouter.get(
  '/history/lead/:id',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await trackingService.historyFor({ leadId: req.params.id }))),
);

messagingRouter.get(
  '/history/contact/:id',
  requirePermission('marketing_email.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await trackingService.historyFor({ contactId: req.params.id }))),
);

messagingRouter.get(
  '/queue/:id',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await queueService.get(req.params.id))),
);

messagingRouter.post(
  '/queue/:id/cancel',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema, body: cancelSchema }),
  asyncHandler(async (req, res) => {
    const message = await queueService.cancel(req.params.id, req.body.reason);
    await audit({
      userId: req.auth?.userId,
      action: 'messaging.cancel',
      entityType: 'scheduled_message',
      entityId: req.params.id,
      ip: req.ip,
    });
    ok(res, message);
  }),
);

// Stop a bulk send that is still draining.
messagingRouter.post(
  '/batches/:id/cancel',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await queueService.cancelBatch(req.params.id);
    await audit({
      userId: req.auth?.userId,
      action: 'messaging.cancel_batch',
      entityType: 'send_batch',
      entityId: req.params.id,
      after: result,
      ip: req.ip,
    });
    ok(res, result);
  }),
);

messagingRouter.get(
  '/settings',
  requirePermission('messaging.read'),
  asyncHandler(async (_req, res) => ok(res, await queueService.getSettings())),
);

// Quiet hours, throttle and the global pause switch.
messagingRouter.put(
  '/settings',
  requirePermission('settings.write'),
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const settings = await queueService.updateSettings(req.body);
    await audit({
      userId: req.auth?.userId,
      action: 'messaging.settings',
      entityType: 'app_setting',
      entityId: 'messaging',
      after: settings,
      ip: req.ip,
    });
    ok(res, settings);
  }),
);

// Drain the queue now instead of waiting for the next tick. Used by the
// "Send due now" button and when demonstrating the queue.
messagingRouter.post(
  '/queue/run',
  requirePermission('messaging.send'),
  asyncHandler(async (_req, res) => ok(res, await tick())),
);

// ── Manual send (Stage 3) ─────────────────────────────

// Copy a template — the usual way a new one starts.
messagingRouter.post(
  '/templates/:id/duplicate',
  requirePermission('messaging.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) =>
    created(res, await messagingService.duplicateTemplate(req.params.id, req.auth!.userId)),
  ),
);

// Send one to yourself to see how it looks. Bypasses quiet hours, since the
// operator is sitting there waiting for it.
messagingRouter.post(
  '/templates/:id/test-send',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sendService.testSend(req.auth!, req.params.id))),
);

// What the confirm step shows: who is in, who was dropped and why, and the
// message rendered for the first real recipient.
messagingRouter.post(
  '/send/preview',
  requirePermission('messaging.send'),
  validate({ body: sendPreviewSchema }),
  asyncHandler(async (req, res) => ok(res, await sendService.preview(req.auth!, req.body))),
);

messagingRouter.post(
  '/send',
  requirePermission('messaging.send'),
  validate({ body: sendSchema }),
  asyncHandler(async (req, res) => {
    const result = await sendService.send(req.auth!, req.body);
    await audit({
      userId: req.auth?.userId,
      action: 'messaging.send_batch',
      entityType: 'send_batch',
      entityId: result.batchId,
      after: { queued: result.queued, templateId: req.body.templateId },
      ip: req.ip,
    });
    created(res, result);
  }),
);

// ── Sequences (Stage 4) ───────────────────────────────

messagingRouter.get(
  '/sequences',
  requirePermission('messaging.read'),
  asyncHandler(async (_req, res) => ok(res, await sequenceService.list())),
);

messagingRouter.post(
  '/sequences',
  requirePermission('messaging.write'),
  validate({ body: createSequenceSchema }),
  asyncHandler(async (req, res) => created(res, await sequenceService.create(req.body, req.auth!.userId))),
);

messagingRouter.get(
  '/sequences/:id',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.get(req.params.id))),
);

messagingRouter.patch(
  '/sequences/:id',
  requirePermission('messaging.write'),
  validate({ params: idParamSchema, body: updateSequenceSchema }),
  asyncHandler(async (req, res) => {
    const sequence = await sequenceService.update(req.params.id, req.body);
    // Switching a sequence on starts sending to customers, so it is audited.
    if (req.body.isActive !== undefined) {
      await audit({
        userId: req.auth?.userId,
        action: req.body.isActive ? 'messaging.sequence_on' : 'messaging.sequence_off',
        entityType: 'message_sequence',
        entityId: req.params.id,
        ip: req.ip,
      });
    }
    ok(res, sequence);
  }),
);

// Steps are replaced wholesale rather than patched one at a time.
messagingRouter.put(
  '/sequences/:id/steps',
  requirePermission('messaging.write'),
  validate({ params: idParamSchema, body: setStepsSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.setSteps(req.params.id, req.body.steps))),
);

messagingRouter.delete(
  '/sequences/:id',
  requirePermission('messaging.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await sequenceService.remove(req.params.id);
    noContent(res);
  }),
);

// ── Per-lead follow-ups ───────────────────────────────

messagingRouter.get(
  '/leads/:id/follow-ups',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.forLead(req.params.id))),
);

messagingRouter.post(
  '/enrolments/:id/pause',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.pause(req.params.id))),
);

messagingRouter.post(
  '/enrolments/:id/resume',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.resume(req.params.id))),
);

messagingRouter.post(
  '/enrolments/:id/cancel',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema, body: stopReasonSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.cancel(req.params.id, req.body.reason))),
);

// Skip or hurry a single step without touching the rest of the ladder.
messagingRouter.post(
  '/queue/:id/skip',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.skipMessage(req.params.id))),
);

messagingRouter.post(
  '/queue/:id/send-now',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.sendNow(req.params.id))),
);

// A customer replied — the single most important stop signal, and the one a
// rep can trigger by hand when the reply came by phone.
messagingRouter.post(
  '/leads/:id/replied',
  requirePermission('messaging.send'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await sequenceService.stopForLead(req.params.id, 'customer replied', 'stopOnReply')),
  ),
);

// ── Deal follow-ups (Stage 5) ─────────────────────────

messagingRouter.get(
  '/deals/:id/follow-ups',
  requirePermission('messaging.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await sequenceService.forDeal(req.params.id))),
);
