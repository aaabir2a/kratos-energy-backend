import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { authRateLimiter } from '../../core/middlewares/rateLimit.middleware';
import { authController } from './auth.controller';
import { loginSchema, refreshSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
authRouter.post('/refresh', authRateLimiter, validate({ body: refreshSchema }), asyncHandler(authController.refresh));
authRouter.post('/logout', validate({ body: refreshSchema }), asyncHandler(authController.logout));
authRouter.get('/me', authenticate, asyncHandler(authController.me));
