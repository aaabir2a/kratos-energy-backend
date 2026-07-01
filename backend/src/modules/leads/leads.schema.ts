import { z } from 'zod';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

export const createLeadSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  secondaryPhone: z.string().max(50).optional(),
  addressLine: z.string().max(255).optional(),
  suburb: z.string().max(100).optional(),
  state: z.enum(AU_STATES).optional(),
  postcode: z.string().max(10).optional(),
  propertyType: z.string().max(50).optional(),
  roofType: z.string().max(50).optional(),
  estimatedSystemSize: z.string().max(50).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  leadSourceId: z.string().uuid().optional(),
  officeId: z.string().uuid().optional(),
  leadType: z.string().max(100).optional(),
  consentMarketing: z.boolean().optional(),
  assignedToId: z.string().uuid().optional(), // explicit assignment; else auto round-robin
  autoAssign: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional(),
});

export const updateLeadSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  secondaryPhone: z.string().max(50).nullable().optional(),
  addressLine: z.string().max(255).nullable().optional(),
  suburb: z.string().max(100).nullable().optional(),
  state: z.enum(AU_STATES).nullable().optional(),
  postcode: z.string().max(10).nullable().optional(),
  propertyType: z.string().max(50).nullable().optional(),
  roofType: z.string().max(50).nullable().optional(),
  estimatedSystemSize: z.string().max(50).nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  score: z.number().int().min(0).max(100).optional(),
  leadSourceId: z.string().uuid().nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

export const listLeadQuerySchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  stageId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'CONVERTED', 'LOST', 'JUNK']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  assignedToId: z.string().uuid().optional(),
  leadSourceId: z.string().uuid().optional(),
  sort: z.enum(['createdAt', 'score', 'nextFollowUpAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const assignSchema = z.object({
  assignedToId: z.string().uuid().nullable(), // null + autoAssign triggers round-robin
  autoAssign: z.boolean().optional(),
});

export const moveStageSchema = z.object({
  stageId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const lostSchema = z.object({
  lostReason: z.string().min(1).max(500),
});

export const addNoteSchema = z.object({
  body: z.string().min(1).max(2000),
  isPinned: z.boolean().optional(),
});

export const addActivitySchema = z.object({
  type: z.enum(['CALL', 'EMAIL', 'SMS', 'MEETING', 'NOTE']),
  subject: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });
