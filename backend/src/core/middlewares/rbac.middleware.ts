import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../shared/errors/AppError';

const WILDCARD = '*.*';

function hasPermission(perms: string[], required: string): boolean {
  if (perms.includes(WILDCARD)) return true;
  if (perms.includes(required)) return true;
  // resource-level wildcard, e.g. "leads.*"
  const [resource] = required.split('.');
  return perms.includes(`${resource}.*`);
}

// Require ALL listed permissions.
export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(AppError.unauthorized());
    const ok = required.every((p) => hasPermission(req.auth!.permissions, p));
    if (!ok) return next(AppError.forbidden());
    next();
  };
}

// Require ANY of the listed permissions.
export function requireAnyPermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(AppError.unauthorized());
    const ok = required.some((p) => hasPermission(req.auth!.permissions, p));
    if (!ok) return next(AppError.forbidden());
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!roles.includes(req.auth.role)) return next(AppError.forbidden());
    next();
  };
}
