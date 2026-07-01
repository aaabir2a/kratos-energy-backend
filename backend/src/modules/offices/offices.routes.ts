import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { officesController } from './offices.controller';
import { createOfficeSchema, updateOfficeSchema, idParamSchema } from './offices.schema';

export const officesRouter = Router();

officesRouter.use(authenticate);

officesRouter.get('/', requirePermission('offices.read'), asyncHandler(officesController.list));
officesRouter.get('/:id', requirePermission('offices.read'), validate({ params: idParamSchema }), asyncHandler(officesController.get));
officesRouter.post('/', requirePermission('offices.write'), validate({ body: createOfficeSchema }), asyncHandler(officesController.create));
officesRouter.patch('/:id', requirePermission('offices.write'), validate({ params: idParamSchema, body: updateOfficeSchema }), asyncHandler(officesController.update));
officesRouter.delete('/:id', requirePermission('offices.write'), validate({ params: idParamSchema }), asyncHandler(officesController.remove));
