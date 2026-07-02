import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authRateLimiter } from '../../core/middlewares/rateLimit.middleware';
import { AppError } from '../../shared/errors/AppError';
import { env } from '../../core/config/env';
import { ok, created } from '../../shared/utils/response';
import { intakeService } from './intake.service';
import {
  publicSubmitSchema,
  chatbotIntakeSchema,
  socialIntakeSchema,
  socialPlatformParamSchema,
} from './intake.schema';

function clientMeta(req: Request) {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

// Shared-secret guard for machine-to-machine webhooks.
function requireWebhookSecret(req: Request, _res: Response, next: NextFunction): void {
  const secret = req.header('x-webhook-secret');
  if (!secret || secret !== env.INTAKE_WEBHOOK_SECRET) {
    return next(AppError.unauthorized('Invalid webhook secret'));
  }
  next();
}

export const intakeRouter = Router();

// Public website/landing-page submission — rate-limited + honeypot.
intakeRouter.post(
  '/submit',
  authRateLimiter,
  validate({ body: publicSubmitSchema }),
  asyncHandler(async (req, res) => {
    const result = await intakeService.publicSubmit(req.body, clientMeta(req));
    // Honeypot or duplicate — both return generic success (no data leakage to bots).
    if (!result) return ok(res, { message: 'Thank you, we will be in touch shortly.' });
    created(res, {
      message: 'Thank you, we will be in touch shortly.',
      reference: result.leadId,
    });
  }),
);

// Chatbot webhook.
intakeRouter.post(
  '/chatbot',
  authRateLimiter,
  requireWebhookSecret,
  validate({ body: chatbotIntakeSchema }),
  asyncHandler(async (req, res) => {
    const result = await intakeService.chatbot(req.body, clientMeta(req));
    created(res, { leadId: result.leadId, duplicate: result.duplicate });
  }),
);

// Social lead-ads webhook.
intakeRouter.post(
  '/social/:platform',
  authRateLimiter,
  requireWebhookSecret,
  validate({ params: socialPlatformParamSchema, body: socialIntakeSchema }),
  asyncHandler(async (req, res) => {
    const result = await intakeService.social(req.params.platform, req.body, clientMeta(req));
    created(res, { leadId: result.leadId, duplicate: result.duplicate });
  }),
);
