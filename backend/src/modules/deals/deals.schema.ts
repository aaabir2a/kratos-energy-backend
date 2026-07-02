import { z } from 'zod';

export const dealItemInput = z.object({
  itemType: z.enum(['PACKAGE', 'PRODUCT', 'CUSTOM']).optional().default('CUSTOM'),
  productId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().nonnegative().default(0),
});

export const convertLeadSchema = z.object({
  title: z.string().min(1).max(200).optional(), // defaults to "<name> — <system size>"
  value: z.number().nonnegative().optional(),
  expectedCloseDate: z.string().date().optional(),
  items: z.array(dealItemInput).optional(),
});

export const updateDealSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  value: z.number().nonnegative().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  ownerId: z.string().uuid().optional(),
});

export const listDealQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  stageId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'WON', 'LOST']).optional(),
  ownerId: z.string().uuid().optional(),
});

export const moveDealStageSchema = z.object({
  stageId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const loseDealSchema = z.object({
  lostReason: z.string().min(1).max(500),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
export const itemParamSchema = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });
