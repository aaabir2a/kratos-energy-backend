import { z } from 'zod';

// Zod at the edges, same as every other module.

export const idParamSchema = z.object({ id: z.string().uuid() });

// ── Lists ─────────────────────────────────────────────

export const createListSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
});

export const updateListSchema = createListSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
});

// ── Contacts ──────────────────────────────────────────

export const createContactSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  // Anything beyond the known columns, e.g. { "company": "Acme" }.
  customData: z.record(z.string()).optional(),
  listIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateContactSchema = createContactSchema.partial().omit({ listIds: true });

export const contactQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  listId: z.string().uuid().optional(),
  // Only contacts that cannot be emailed, for cleaning a list up.
  suppressedOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const membershipSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(2000),
});

// ── Import ────────────────────────────────────────────

/** Maps a CSV column index to a known field, or keeps it as a custom column. */
export const importMappingSchema = z.object({
  listId: z.string().uuid(),
  /** header name → 'email' | 'firstName' | 'lastName' | 'custom' | 'ignore' */
  mapping: z.record(z.enum(['email', 'firstName', 'lastName', 'custom', 'ignore'])),
});

export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactQuery = z.infer<typeof contactQuerySchema>;
export type ImportMapping = z.infer<typeof importMappingSchema>;

// ── Campaigns ─────────────────────────────────────────

export const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'] as const;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(160),
  templateId: z.string().uuid().optional(),
  listIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  templateId: z.string().uuid().nullable().optional(),
  listIds: z.array(z.string().uuid()).max(50).optional(),
});

export const campaignQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export const sendCampaignSchema = z.object({
  /** Omit to send as soon as sending is allowed. */
  scheduledFor: z.string().datetime().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
