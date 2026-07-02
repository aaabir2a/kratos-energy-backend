import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requireAnyPermission, requirePermission } from '../../core/middlewares/rbac.middleware';
import { validate } from '../../core/middlewares/validate.middleware';
import { ok, created } from '../../shared/utils/response';
import { prisma } from '../../core/database/prisma';
import { attributionService } from './attribution.service';

export const sourcesRouter = Router();
export const campaignsRouter = Router();

sourcesRouter.use(authenticate);
campaignsRouter.use(authenticate);

// Lead sources are reference data — any role that reads leads/sources can list them.
sourcesRouter.get(
  '/',
  requireAnyPermission('sources.read', 'leads.read'),
  asyncHandler(async (_req, res) => {
    const sources = await prisma.leadSource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    ok(res, sources);
  }),
);

// Attribution report — leads by source w/ conversion. ?days=30 to window it.
sourcesRouter.get(
  '/attribution',
  requireAnyPermission('sources.read', 'analytics.read'),
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : undefined;
    ok(res, await attributionService.bySource(days));
  }),
);

// ── Campaigns ─────────────────────────────────────────
export const createCampaignSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  channel: z.string().max(50).optional(),
  utmCampaign: z.string().max(255).optional(),
  budget: z.number().nonnegative().optional(),
  spend: z.number().nonnegative().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  isActive: z.boolean().optional(),
});

campaignsRouter.get(
  '/',
  requireAnyPermission('campaigns.read', 'analytics.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await attributionService.byCampaign());
  }),
);

campaignsRouter.post(
  '/',
  requirePermission('campaigns.write'),
  validate({ body: createCampaignSchema }),
  asyncHandler(async (req, res) => {
    const { startDate, endDate, ...rest } = req.body;
    const campaign = await prisma.marketingCampaign.create({
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    created(res, campaign);
  }),
);

campaignsRouter.patch(
  '/:id',
  requirePermission('campaigns.write'),
  validate({ params: z.object({ id: z.string().uuid() }), body: updateCampaignSchema }),
  asyncHandler(async (req, res) => {
    const { startDate, endDate, ...rest } = req.body;
    const campaign = await prisma.marketingCampaign.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(startDate ? { startDate: new Date(startDate) } : {}),
        ...(endDate ? { endDate: new Date(endDate) } : {}),
      },
    });
    ok(res, campaign);
  }),
);
