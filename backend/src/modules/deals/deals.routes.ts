import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { dealsService } from './deals.service';
import type { AuthContext } from '../leads/leads.scope';
import {
  convertLeadSchema,
  updateDealSchema,
  dealItemInput,
  moveDealStageSchema,
  loseDealSchema,
  idParamSchema,
  itemParamSchema,
} from './deals.schema';

const ctx = (req: Request): AuthContext => req.auth as AuthContext;

export const dealsRouter = Router();
dealsRouter.use(authenticate);

dealsRouter.get(
  '/',
  requirePermission('deals.read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await dealsService.list(ctx(req), {
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
      stageId: req.query.stageId as string | undefined,
      status: req.query.status as never,
      ownerId: req.query.ownerId as string | undefined,
    });
    paginated(res, items, meta);
  }),
);

dealsRouter.get(
  '/stats',
  requirePermission('deals.read'),
  asyncHandler(async (req, res) => ok(res, await dealsService.stats(ctx(req)))),
);

dealsRouter.get(
  '/:id',
  requirePermission('deals.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await dealsService.getById(ctx(req), req.params.id))),
);

dealsRouter.patch(
  '/:id',
  requirePermission('deals.write'),
  validate({ params: idParamSchema, body: updateDealSchema }),
  asyncHandler(async (req, res) => {
    const deal = await dealsService.update(ctx(req), req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'deal.update', entityType: 'deal', entityId: deal.id, ip: req.ip });
    ok(res, deal);
  }),
);

dealsRouter.post(
  '/:id/items',
  requirePermission('deals.write'),
  validate({ params: idParamSchema, body: dealItemInput }),
  asyncHandler(async (req, res) => created(res, await dealsService.addItem(ctx(req), req.params.id, req.body))),
);

dealsRouter.delete(
  '/:id/items/:itemId',
  requirePermission('deals.write'),
  validate({ params: itemParamSchema }),
  asyncHandler(async (req, res) => {
    await dealsService.removeItem(ctx(req), req.params.id, req.params.itemId);
    noContent(res);
  }),
);

dealsRouter.patch(
  '/:id/stage',
  requirePermission('deals.write'),
  validate({ params: idParamSchema, body: moveDealStageSchema }),
  asyncHandler(async (req, res) => {
    const deal = await dealsService.moveStage(ctx(req), req.params.id, req.body.stageId, req.body.reason);
    await audit({ userId: req.auth?.userId, action: 'deal.stage', entityType: 'deal', entityId: deal.id, after: { stageId: req.body.stageId }, ip: req.ip });
    ok(res, deal);
  }),
);

dealsRouter.post(
  '/:id/win',
  requirePermission('deals.close'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const deal = await dealsService.win(ctx(req), req.params.id);
    await audit({ userId: req.auth?.userId, action: 'deal.win', entityType: 'deal', entityId: deal.id, ip: req.ip });
    ok(res, deal);
  }),
);

dealsRouter.post(
  '/:id/lose',
  requirePermission('deals.close'),
  validate({ params: idParamSchema, body: loseDealSchema }),
  asyncHandler(async (req, res) => {
    const deal = await dealsService.lose(ctx(req), req.params.id, req.body.lostReason);
    await audit({ userId: req.auth?.userId, action: 'deal.lose', entityType: 'deal', entityId: deal.id, ip: req.ip });
    ok(res, deal);
  }),
);

// Conversion route lives under /leads/:id/convert — wired in routes.ts.
export const convertHandler = [
  authenticate,
  requirePermission('leads.convert'),
  validate({ params: idParamSchema, body: convertLeadSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const deal = await dealsService.convertLead(ctx(req), req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'lead.convert', entityType: 'lead', entityId: req.params.id, after: { dealId: deal.id }, ip: req.ip });
    created(res, deal);
  }),
] as const;
