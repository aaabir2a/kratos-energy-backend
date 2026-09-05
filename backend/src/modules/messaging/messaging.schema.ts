import { z } from 'zod';

// Zod at the edges, same as every other module. These schemas are also the
// source for the Swagger docs (see core/openapi/registry.ts).

export const MESSAGE_CHANNELS = ['EMAIL', 'SMS'] as const;
export const TEMPLATE_CATEGORIES = [
  'REFERRAL',
  'FOLLOW_UP',
  'AFTERCARE',
  'QUOTE',
  'TRANSACTIONAL',
  'OTHER',
] as const;

export const idParamSchema = z.object({ id: z.string().uuid() });

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  subject: z.string().max(300).optional(),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  key: z.string().max(80).optional(),
  isActive: z.boolean().optional(),
});

// Every field optional — a PATCH only changes what it names.
export const updateTemplateSchema = createTemplateSchema.partial();

export const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
