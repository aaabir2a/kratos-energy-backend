import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): Response {
  return res.status(201).json({ success: true, data });
}

export function paginated<T>(res: Response, data: T[], meta: PaginationMeta): Response {
  return res.status(200).json({ success: true, data, meta });
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}
