import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { rolesController } from './roles.controller';
import { updateRolePermissionsSchema, idParamSchema } from './roles.schema';

export const rolesRouter = Router();

rolesRouter.use(authenticate);

rolesRouter.get('/', requirePermission('roles.read'), asyncHandler(rolesController.list));
rolesRouter.get('/permissions', requirePermission('roles.read'), asyncHandler(rolesController.listPermissions));
rolesRouter.get('/:id', requirePermission('roles.read'), validate({ params: idParamSchema }), asyncHandler(rolesController.get));
rolesRouter.patch(
  '/:id/permissions',
  requirePermission('roles.write'),
  validate({ params: idParamSchema, body: updateRolePermissionsSchema }),
  asyncHandler(rolesController.setPermissions),
);
