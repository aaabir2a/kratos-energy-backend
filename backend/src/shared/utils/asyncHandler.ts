import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps async controllers so thrown/rejected errors reach the error middleware.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
