import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage, buildMeta } from '../../shared/utils/pagination';
import { messagingService } from './messaging.service';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
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
