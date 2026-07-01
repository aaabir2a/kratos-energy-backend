import { z } from 'zod';

export const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().max(50).optional(),
  roleId: z.string().uuid(),
  officeId: z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).nullable().optional(),
  roleId: z.string().uuid().optional(),
  officeId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const listUserQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  roleId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
