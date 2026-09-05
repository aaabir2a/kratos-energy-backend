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
import { tick } from './worker';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  listQueueQuerySchema,
  updateSettingsSchema,
  cancelSchema,
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
