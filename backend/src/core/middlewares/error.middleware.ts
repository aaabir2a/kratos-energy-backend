import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../logger/logger';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  } satisfies ErrorBody);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let body: ErrorBody = {
    success: false,
    error: { code: 'INTERNAL', message: 'Internal server error' },
  };

  if (err instanceof AppError) {
    status = err.statusCode;
    body = { success: false, error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 422;
    body = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten() },
    };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      body = {
        success: false,
        error: { code: 'CONFLICT', message: 'A record with this value already exists', details: err.meta },
      };
    } else if (err.code === 'P2025') {
      status = 404;
      body = { success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } };
    }
  }

  if (status >= 500) {
    logger.error({ err, reqId: req.id, path: req.path }, 'Unhandled error');
  } else {
    logger.warn({ code: body.error.code, reqId: req.id, path: req.path }, body.error.message);
  }

  res.status(status).json(body);
}
