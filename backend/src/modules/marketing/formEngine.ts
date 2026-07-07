import { z } from 'zod';

// ── Field descriptor stored in custom_lead_forms.fields_schema ──
export const FIELD_TYPES = [
  'text',
  'email',
  'phone',
  'number',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'textarea',
  'date',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// A field may route its submitted value into a core lead column instead of
// (or as well as) the custom-responses JSON. Lets a CRM-built form fully define
// the contact form — name/email/phone become mapped fields.
export const MAP_TARGETS = ['firstName', 'lastName', 'email', 'phone', 'suburb', 'state', 'postcode'] as const;
export type MapTarget = (typeof MAP_TARGETS)[number];

export const fieldDescriptorSchema = z.object({
  field_name: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, 'snake_case starting with a letter'),
  label: z.string().min(1).max(150),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1)).optional(), // select / multiselect / radio
  placeholder: z.string().max(150).optional(),
  help_text: z.string().max(300).optional(),
  order: z.number().int().min(0).default(0),
  maps_to: z.enum(MAP_TARGETS).optional(), // route value into a core lead column
  validation: z
    .object({
      min: z.number().optional(), // number: value bounds; text: length bounds
      max: z.number().optional(),
      pattern: z.string().max(300).optional(),
    })
    .optional(),
});

export const fieldsSchemaSchema = z
  .array(fieldDescriptorSchema)
  .max(30)
  .superRefine((fields, ctx) => {
    const names = new Set<string>();
    const maps = new Set<string>();
    for (const f of fields) {
      if (names.has(f.field_name)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate field_name "${f.field_name}"` });
      }
      names.add(f.field_name);
      if (['select', 'multiselect', 'radio'].includes(f.type) && !f.options?.length) {
        ctx.addIssue({ code: 'custom', message: `Field "${f.field_name}" of type ${f.type} needs options` });
      }
      if (f.maps_to) {
        if (maps.has(f.maps_to)) {
          ctx.addIssue({ code: 'custom', message: `Two fields both map to "${f.maps_to}" — each core field can be mapped once` });
        }
        maps.add(f.maps_to);
      }
    }
  });

export type FieldDescriptor = z.infer<typeof fieldDescriptorSchema>;

// ── Runtime validation of a submission against a stored schema ──
// (the PDF's "Dynamic Lead Capture Validation Engine": type-check + required
//  check every dynamic value; reject missing required keys.)
export interface FieldError {
  field: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]{6,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSubmission(
  fields: FieldDescriptor[],
  values: Record<string, unknown>,
): { valid: boolean; errors: FieldError[]; cleaned: Record<string, unknown> } {
  const errors: FieldError[] = [];
  const cleaned: Record<string, unknown> = {};
  const known = new Set(fields.map((f) => f.field_name));

  // Unknown keys are dropped silently (defensive against payload stuffing).
  for (const f of fields) {
    const raw = values[f.field_name];
    const missing = raw === undefined || raw === null || raw === '';

    if (missing) {
      if (f.required) errors.push({ field: f.field_name, message: `${f.label} is required` });
      continue;
    }

    switch (f.type) {
      case 'text':
      case 'textarea': {
        if (typeof raw !== 'string') {
          errors.push({ field: f.field_name, message: `${f.label} must be text` });
          break;
        }
        const min = f.validation?.min;
        const max = f.validation?.max ?? (f.type === 'text' ? 500 : 5000);
        if (min !== undefined && raw.length < min) {
          errors.push({ field: f.field_name, message: `${f.label} must be at least ${min} characters` });
          break;
        }
        if (raw.length > max) {
          errors.push({ field: f.field_name, message: `${f.label} must be at most ${max} characters` });
          break;
        }
        if (f.validation?.pattern) {
          try {
            if (!new RegExp(f.validation.pattern).test(raw)) {
              errors.push({ field: f.field_name, message: `${f.label} is not in the expected format` });
              break;
            }
          } catch {
            /* invalid stored pattern — skip pattern check */
          }
        }
        cleaned[f.field_name] = raw;
        break;
      }
      case 'email':
        if (typeof raw !== 'string' || !EMAIL_RE.test(raw)) {
          errors.push({ field: f.field_name, message: `${f.label} must be a valid email` });
        } else cleaned[f.field_name] = raw.toLowerCase();
        break;
      case 'phone':
        if (typeof raw !== 'string' || !PHONE_RE.test(raw)) {
          errors.push({ field: f.field_name, message: `${f.label} must be a valid phone number` });
        } else cleaned[f.field_name] = raw;
        break;
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isNaN(n)) {
          errors.push({ field: f.field_name, message: `${f.label} must be a number` });
          break;
        }
        if (f.validation?.min !== undefined && n < f.validation.min) {
          errors.push({ field: f.field_name, message: `${f.label} must be ≥ ${f.validation.min}` });
        } else if (f.validation?.max !== undefined && n > f.validation.max) {
          errors.push({ field: f.field_name, message: `${f.label} must be ≤ ${f.validation.max}` });
        } else cleaned[f.field_name] = n;
        break;
      }
      case 'select':
      case 'radio':
        if (typeof raw !== 'string' || !f.options?.includes(raw)) {
          errors.push({ field: f.field_name, message: `${f.label} must be one of the offered options` });
        } else cleaned[f.field_name] = raw;
        break;
      case 'multiselect': {
        const arr = Array.isArray(raw) ? raw : [raw];
        if (!arr.every((v) => typeof v === 'string' && f.options?.includes(v))) {
          errors.push({ field: f.field_name, message: `${f.label} contains an invalid option` });
        } else cleaned[f.field_name] = arr;
        break;
      }
      case 'checkbox':
        if (typeof raw !== 'boolean' && raw !== 'true' && raw !== 'false') {
          errors.push({ field: f.field_name, message: `${f.label} must be true or false` });
        } else cleaned[f.field_name] = raw === true || raw === 'true';
        break;
      case 'date':
        if (typeof raw !== 'string' || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
          errors.push({ field: f.field_name, message: `${f.label} must be a date (YYYY-MM-DD)` });
        } else cleaned[f.field_name] = raw;
        break;
    }
  }

  void known;
  return { valid: errors.length === 0, errors, cleaned };
}

export function parseFieldsSchema(json: unknown): FieldDescriptor[] {
  const parsed = fieldsSchemaSchema.safeParse(json);
  return parsed.success ? [...parsed.data].sort((a, b) => a.order - b.order) : [];
}

// Split cleaned submission values into core lead columns (for maps_to fields)
// and the remaining custom responses. Mapped keys are removed from custom.
export function splitMappedFields(
  fields: FieldDescriptor[],
  values: Record<string, unknown>,
): { contact: Partial<Record<MapTarget, string>>; custom: Record<string, unknown> } {
  const contact: Partial<Record<MapTarget, string>> = {};
  const custom: Record<string, unknown> = { ...values };
  for (const f of fields) {
    if (f.maps_to && f.field_name in custom) {
      const v = custom[f.field_name];
      if (v !== undefined && v !== null && v !== '') contact[f.maps_to] = String(v);
      delete custom[f.field_name];
    }
  }
  return { contact, custom };
}
