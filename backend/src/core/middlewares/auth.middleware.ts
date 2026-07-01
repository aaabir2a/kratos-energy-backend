import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { verifyAccessToken } from '../../shared/utils/jwt';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.slice(7).trim();
  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      officeId: payload.officeId,
      role: payload.role,
      permissions: payload.permissions,
    };
    next();
  } catch {
    next(AppError.unauthorized('Invalid or expired access token'));
  }
}
