import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  images: z.array(z.string().url().max(1000)).max(20).optional(), // ordered public URLs
  location: z.string().max(200).optional(),
  projectDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

// Nullable strings so a field can be cleared from the CRM.
export const updateProjectSchema = createProjectSchema.partial().extend({
  description: z.union([z.string().max(5000), z.literal(''), z.null()]).optional(),
  location: z.union([z.string().max(200), z.literal(''), z.null()]).optional(),
  projectDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'), z.literal(''), z.null()])
    .optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
