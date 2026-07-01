import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok } from '../../shared/utils/response';
import { pipelineService } from './pipeline.service';

export const pipelineRouter = Router();

pipelineRouter.use(authenticate);

pipelineRouter.get(
  '/stages',
  requirePermission('pipeline.read'),
  asyncHandler(async (req, res) => {
    const track = (req.query.track as 'LEAD' | 'DEAL') || 'LEAD';
    ok(res, await pipelineService.listStages(track));
  }),
);

// Kanban board: stages with their leads (scoped by role).
pipelineRouter.get(
  '/board',
  requirePermission('pipeline.read'),
  asyncHandler(async (req, res) => {
    ok(res, await pipelineService.board(req.auth!));
  }),
);
