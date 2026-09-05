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

// ── Queue (Stage 1) ───────────────────────────────────
export const MESSAGE_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED'] as const;

export const listQueueQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  batchId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  search: z.string().optional(),
  /** Only messages still to go out. The queue screen's default view. */
  dueOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const sendingWindowSchema = z.object({
  quietStartHour: z.number().int().min(0).max(23),
  quietEndHour: z.number().int().min(0).max(23),
  businessDaysOnly: z.boolean(),
  timezone: z.string().min(1).max(64),
});

export const updateSettingsSchema = z
  .object({
    sendingPaused: z.boolean().optional(),
    sendingWindow: sendingWindowSchema.optional(),
    throttlePerHour: z.number().int().min(1).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// A window that opens after it closes would silently mean "never send".
export const validatedWindowSchema = sendingWindowSchema.refine(
  (w) => w.quietEndHour < w.quietStartHour,
  { message: 'Sending must open before it closes (quietEndHour < quietStartHour)' },
);

export const cancelSchema = z.object({ reason: z.string().max(200).optional() });

export type ListQueueQuery = z.infer<typeof listQueueQuerySchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ── Manual send (Stage 3) ─────────────────────────────

// The subset of lead filters a send can target. Deliberately the same names
// the leads list uses, so "send to everyone matching this view" means exactly
// what the user is looking at.
export const sendFiltersSchema = z.object({
  stageId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'CONVERTED', 'LOST', 'JUNK']).optional(),
  enquiryType: z.enum(['RESIDENTIAL', 'COMMERCIAL']).optional(),
  leadSourceId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const sendPreviewSchema = z
  .object({
    templateId: z.string().uuid(),
    leadIds: z.array(z.string().uuid()).max(2000).optional(),
    filters: sendFiltersSchema.optional(),
  })
  .refine((v) => (v.leadIds?.length ?? 0) > 0 || v.filters !== undefined, {
    message: 'Choose some leads, or a filter, to send to',
  });

export const sendSchema = sendPreviewSchema.innerType().extend({
  name: z.string().max(160).optional(),
  /** Omit to send as soon as the sending window allows. */
  scheduledFor: z.string().datetime().optional(),
});

export type SendPreviewInput = z.infer<typeof sendPreviewSchema>;
export type SendInput = z.infer<typeof sendSchema>;
