import { z } from 'zod';
import { fieldsSchemaSchema } from './formEngine';

export const createPageSchema = z.object({
  title: z.string().min(2).max(200),
  urlSlug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes'),
  heroDescription: z.string().max(500).optional(),
  heroImageUrl: z.string().url().max(1000).optional(),
  detailedDescription: z.string().max(50_000).optional(),
  thankYouMessage: z.string().max(1000).optional(),
  redirectUrl: z.string().url().max(1000).optional(),
  campaignId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  seoMeta: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(160).optional(),
      ogImage: z.string().url().optional(),
    })
    .optional(),
  themeConfig: z.record(z.unknown()).optional(),
});

export const updatePageSchema = createPageSchema.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export const createFormSchema = z.object({
  formTitle: z.string().min(1).max(150),
  fieldsSchema: fieldsSchemaSchema,
  submitButtonText: z.string().max(60).optional(),
});

export const updateFormSchema = z.object({
  formTitle: z.string().min(1).max(150).optional(),
  fieldsSchema: fieldsSchemaSchema.optional(),
  submitButtonText: z.string().max(60).optional(),
  isActive: z.boolean().optional(),
});

// Global site form (singleton) — create-or-update in one call.
export const upsertGlobalFormSchema = z.object({
  formTitle: z.string().min(1).max(150),
  fieldsSchema: fieldsSchemaSchema,
  submitButtonText: z.string().max(60).optional(),
  isActive: z.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
export const slugParamSchema = z.object({ slug: z.string().min(1).max(120) });
