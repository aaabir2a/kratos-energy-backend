import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok } from '../../shared/utils/response';
import { audit } from '../../shared/utils/audit';
import { settingsService } from './settings.service';

export const leadAssignmentSchema = z.object({
  leadAutoAssign: z.boolean(),
});

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get(
  '/',
  requirePermission('settings.read'),
  asyncHandler(async (_req, res) => ok(res, await settingsService.getAll())),
);

// Toggle round-robin auto-assignment for newly captured leads.
settingsRouter.put(
  '/lead-assignment',
  requirePermission('settings.write'),
  validate({ body: leadAssignmentSchema }),
  asyncHandler(async (req, res) => {
    const enabled = await settingsService.setAutoAssignEnabled(req.body.leadAutoAssign);
    await audit({
      userId: req.auth?.userId,
      action: 'settings.lead_auto_assign',
      entityType: 'app_setting',
      entityId: 'leads.autoAssign',
      after: { leadAutoAssign: enabled },
      ip: req.ip,
    });
    ok(res, { leadAutoAssign: enabled });
  }),
);
