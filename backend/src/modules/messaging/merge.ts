// Merge-field rendering for message templates.
//
// Fields are written as {{firstName}} in template bodies and subjects. A field
// with no value renders its fallback rather than an empty gap — nobody should
// receive "Hi ,".

import { escapeHtml } from '../../core/mail/templates';

export type MergeData = Record<string, string | null | undefined>;

/** Fields offered in the editor's picker, with the fallback used when a lead
 *  has no value for them. */
export const MERGE_FIELDS: { field: string; label: string; fallback: string }[] = [
  { field: 'firstName', label: 'First name', fallback: 'there' },
  { field: 'lastName', label: 'Last name', fallback: '' },
  { field: 'fullName', label: 'Full name', fallback: 'there' },
  { field: 'suburb', label: 'Suburb', fallback: 'your area' },
  { field: 'state', label: 'State', fallback: '' },
  { field: 'enquiryType', label: 'Enquiry type', fallback: 'solar' },
  { field: 'repName', label: 'Assigned rep', fallback: 'the Kratos team' },
  { field: 'companyName', label: 'Company name', fallback: 'Kratos Sustainability' },
  { field: 'companyPhone', label: 'Company phone', fallback: '1300 089 547' },
  // Deal fields — only filled when a message belongs to a deal.
  { field: 'dealNumber', label: 'Deal number', fallback: 'your quote' },
  { field: 'dealValue', label: 'Deal value', fallback: 'the quoted amount' },
  { field: 'dealItems', label: 'What was quoted', fallback: 'your system' },
  { field: 'expectedCloseDate', label: 'Expected close date', fallback: 'soon' },
];

const FALLBACKS = new Map(MERGE_FIELDS.map((f) => [f.field, f.fallback]));

// {{ field }} — tolerant of spaces, strict about the field name so a stray
// brace in copy is left alone rather than eaten.
const TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export interface RenderOptions {
  /** HTML-escape substituted values. True for HTML bodies, false for plain
   *  text and SMS. */
  escape?: boolean;
}

/**
 * Substitute {{tokens}} in `template` from `data`.
 *
 * Unknown fields are left untouched — a typo shows up in the preview as
 * {{frstName}} instead of silently vanishing, which is the difference between
 * catching it and sending it.
 */
export function renderTemplate(template: string, data: MergeData, options: RenderOptions = {}): string {
  const escape = options.escape ?? true;
  return template.replace(TOKEN, (whole, field: string) => {
    const raw = data[field];
    const value = raw === null || raw === undefined || raw === '' ? FALLBACKS.get(field) : raw;
    if (value === undefined) return whole; // unknown field — leave it visible
    return escape ? escapeHtml(value) : value;
  });
}

/** Field names used by a template, in first-appearance order. Powers the
 *  editor's "this template needs" hint and the pre-send check. */
export function usedMergeFields(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(TOKEN)) {
    const field = match[1];
    if (!found.includes(field)) found.push(field);
  }
  return found;
}

/** Fields a template references that we cannot supply. Shown as a warning in
 *  the editor before anyone schedules a send. */
export function unknownMergeFields(template: string): string[] {
  return usedMergeFields(template).filter((f) => !FALLBACKS.has(f));
}

/** Build the merge data for a lead. Kept here so the preview, the test send
 *  and the real send all populate fields identically. */
export function mergeDataForLead(lead: {
  firstName: string;
  lastName: string;
  suburb?: string | null;
  state?: string | null;
  enquiryType?: string | null;
  assignedTo?: { firstName: string; lastName: string } | null;
}): MergeData {
  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName,
    suburb: lead.suburb ?? undefined,
    state: lead.state ?? undefined,
    enquiryType: lead.enquiryType ? lead.enquiryType.toLowerCase() : undefined,
    repName: lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`.trim() : undefined,
  };
}

const money = (value: number) =>
  `$${value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Deal fields for a message about a quote or a closed sale.
 *
 * Line items come from the deal's own snapshot prices — never recomputed from
 * the live catalog, because rebates change and a customer must be told what
 * they actually agreed to.
 */
export function mergeDataForDeal(deal: {
  dealNumber: number | string;
  value: unknown;
  expectedCloseDate?: Date | null;
  items?: { description: string; quantity: number; unitPrice: unknown; lineTotal: unknown }[];
}): MergeData {
  const items = deal.items ?? [];
  return {
    dealNumber: `D-${deal.dealNumber}`,
    dealValue: money(Number(deal.value ?? 0)),
    expectedCloseDate: deal.expectedCloseDate
      ? deal.expectedCloseDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      : undefined,
    dealItems: items.length
      ? items
          .map((i) => `${i.quantity} × ${i.description} — ${money(Number(i.lineTotal ?? 0))}`)
          .join('\n')
      : undefined,
  };
}
