import { z } from 'zod';

export const createOfficeSchema = z.object({
  name: z.string().min(2).max(150),
  code: z.string().min(2).max(20).regex(/^[A-Z0-9_-]+$/, 'Use uppercase letters, numbers, - or _'),
  timezone: z.string().default('Australia/Sydney'),
  phone: z.string().max(50).optional(),
});

export const updateOfficeSchema = createOfficeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listOfficeQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
