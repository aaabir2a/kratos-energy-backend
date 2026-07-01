export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS[code];
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(msg: string, details?: unknown) {
    return new AppError('BAD_REQUEST', msg, details);
  }
  static validation(msg: string, details?: unknown) {
    return new AppError('VALIDATION_ERROR', msg, details);
  }
  static unauthorized(msg = 'Authentication required') {
    return new AppError('UNAUTHORIZED', msg);
  }
  static forbidden(msg = 'You do not have permission to perform this action') {
    return new AppError('FORBIDDEN', msg);
  }
  static notFound(msg = 'Resource not found') {
    return new AppError('NOT_FOUND', msg);
  }
  static conflict(msg: string, details?: unknown) {
    return new AppError('CONFLICT', msg, details);
  }
}
