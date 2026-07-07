import { z } from 'zod';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

// Attribution block every channel may carry.
export const attributionSchema = z.object({
  utmSource: z.string().max(255).optional(),
  utmMedium: z.string().max(255).optional(),
  utmCampaign: z.string().max(255).optional(),
  utmTerm: z.string().max(255).optional(),
  utmContent: z.string().max(255).optional(),
  gclid: z.string().max(255).optional(),
  fbclid: z.string().max(255).optional(),
  referrerUrl: z.string().max(1000).optional(),
});

// Public website/landing-page form submission.
// Core contact fields are optional here because a CRM-built form may supply them
// via mapped custom fields (maps_to). The "must have a name + email/phone" rule
// is enforced in the service AFTER mapping is applied.
export const publicSubmitSchema = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional().default(''),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(50).optional(),
    addressLine: z.string().max(255).optional(),
    suburb: z.string().max(100).optional(),
    state: z.enum(AU_STATES).optional(),
    postcode: z.string().max(10).optional(),
    propertyType: z.string().max(50).optional(),
    roofType: z.string().max(50).optional(),
    estimatedSystemSize: z.string().max(50).optional(),
    message: z.string().max(2000).optional(),
    consentMarketing: z.boolean().optional(),
    sourceSlug: z.string().max(50).optional(), // defaults to "website"
    landingPageSlug: z.string().max(120).optional(), // ties submission to a published page + its form
    customFields: z.record(z.unknown()).optional(), // validated against the page's fields_schema
    // Honeypot — bots fill it, humans never see it. Non-empty => silently drop.
    website: z.string().optional(),
  })
  .merge(attributionSchema);

// Chatbot webhook.
export const chatbotIntakeSchema = z
  .object({
    sessionId: z.string().min(1).max(255),
    botVersion: z.string().max(50).optional(),
    transcript: z.unknown().optional(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional().default(''),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(50).optional(),
    suburb: z.string().max(100).optional(),
    state: z.enum(AU_STATES).optional(),
    postcode: z.string().max(10).optional(),
    estimatedSystemSize: z.string().max(50).optional(),
    consentMarketing: z.boolean().optional(),
  })
  .merge(attributionSchema)
  .refine((d) => d.email || d.phone, { message: 'Provide at least an email or phone number' });

// Social lead-ads webhook (normalized payload).
export const socialIntakeSchema = z
  .object({
    externalLeadId: z.string().max(255).optional(),
    adId: z.string().max(255).optional(),
    campaignName: z.string().max(255).optional(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().max(100).optional().default(''),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(50).optional(),
    suburb: z.string().max(100).optional(),
    state: z.enum(AU_STATES).optional(),
    postcode: z.string().max(10).optional(),
    consentMarketing: z.boolean().optional(),
    raw: z.record(z.unknown()).optional(),
  })
  .merge(attributionSchema)
  .refine((d) => d.email || d.phone, { message: 'Provide at least an email or phone number' });

export const socialPlatformParamSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'google-ads']),
});

export type PublicSubmitInput = z.infer<typeof publicSubmitSchema>;
export type ChatbotIntakeInput = z.infer<typeof chatbotIntakeSchema>;
export type SocialIntakeInput = z.infer<typeof socialIntakeSchema>;
export type AttributionInput = z.infer<typeof attributionSchema>;
