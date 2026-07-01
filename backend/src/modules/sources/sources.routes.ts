import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requireAnyPermission } from '../../core/middlewares/rbac.middleware';
import { ok } from '../../shared/utils/response';
import { prisma } from '../../core/database/prisma';

export const sourcesRouter = Router();

sourcesRouter.use(authenticate);

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
