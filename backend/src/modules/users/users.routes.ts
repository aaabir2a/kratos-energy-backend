import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { usersController } from './users.controller';
import { createUserSchema, updateUserSchema, idParamSchema } from './users.schema';

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get('/', requirePermission('users.read'), asyncHandler(usersController.list));
usersRouter.get('/:id', requirePermission('users.read'), validate({ params: idParamSchema }), asyncHandler(usersController.get));
usersRouter.post('/', requirePermission('users.write'), validate({ body: createUserSchema }), asyncHandler(usersController.create));
usersRouter.patch('/:id', requirePermission('users.write'), validate({ params: idParamSchema, body: updateUserSchema }), asyncHandler(usersController.update));
usersRouter.delete('/:id', requirePermission('users.delete'), validate({ params: idParamSchema }), asyncHandler(usersController.remove));
