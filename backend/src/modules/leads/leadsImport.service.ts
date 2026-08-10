import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { parseCsv } from '../../shared/utils/csv';
import { settingsService } from '../settings/settings.service';
import { pickRoundRobinAssignee } from './assignment.service';
import { notificationService } from '../notifications/notification.service';
import type { AuthContext } from './leads.scope';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const STATUSES = ['OPEN', 'CONVERTED', 'LOST', 'JUNK'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];

// Accepted column headers, matched case/space/punctuation-insensitively so a
// file exported from this CRM (or lightly edited in Excel) imports as-is.
export const IMPORT_COLUMNS = [
  { key: 'firstName', header: 'First name', required: true, example: 'Jane', rules: 'Required.' },
  { key: 'lastName', header: 'Last name', required: false, example: 'Doe', rules: '' },
  { key: 'email', header: 'Email', required: false, example: 'jane@example.com', rules: 'Email or Phone is required.' },
  { key: 'phone', header: 'Phone', required: false, example: '0400 111 222', rules: 'Email or Phone is required.' },
  { key: 'secondaryPhone', header: 'Secondary phone', required: false, example: '', rules: '' },
  { key: 'addressLine', header: 'Address', required: false, example: '12 Smith St', rules: '' },
  { key: 'suburb', header: 'Suburb', required: false, example: 'Wollongong', rules: '' },
  { key: 'state', header: 'State', required: false, example: 'NSW', rules: `One of ${AU_STATES.join(', ')}.` },
  { key: 'postcode', header: 'Postcode', required: false, example: '2500', rules: '' },
  { key: 'status', header: 'Status', required: false, example: 'OPEN', rules: `One of ${STATUSES.join(', ')}. Defaults to OPEN.` },
  { key: 'stage', header: 'Stage', required: false, example: 'New', rules: 'Must match an existing pipeline stage name.' },
  { key: 'priority', header: 'Priority', required: false, example: 'MEDIUM', rules: `One of ${PRIORITIES.join(', ')}. Defaults to MEDIUM.` },
  { key: 'source', header: 'Source', required: false, example: 'Website', rules: 'Must match an existing lead source name.' },
  { key: 'assignedTo', header: 'Assigned to', required: false, example: 'rep@kratosenergy.com.au', rules: "The rep's email. Must be an existing active user." },
  { key: 'estimatedSystemSize', header: 'System size', required: false, example: '6.6kW', rules: '' },
  { key: 'propertyType', header: 'Property type', required: false, example: 'Residential', rules: '' },
  { key: 'roofType', header: 'Roof type', required: false, example: 'Tile', rules: '' },
  { key: 'consentMarketing', header: 'Marketing consent', required: false, example: 'Yes', rules: 'Yes/No (or true/false).' },
  { key: 'nextFollowUpAt', header: 'Next follow-up', required: false, example: '2026-09-01', rules: 'Date as YYYY-MM-DD.' },
  { key: 'notes', header: 'Notes', required: false, example: 'Called, wants a quote', rules: 'Saved as the first note.' },
] as const;

type ColumnKey = (typeof IMPORT_COLUMNS)[number]['key'];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_LOOKUP = new Map<string, ColumnKey>(
  IMPORT_COLUMNS.flatMap((c) => [
    [norm(c.header), c.key] as [string, ColumnKey],
    [norm(c.key), c.key] as [string, ColumnKey],
  ]),
);

export interface RowIssue {
  row: number; // 1-based spreadsheet row (header is row 1)
  column: string;
  value: string;
  message: string;
}

interface ParsedRow {
  row: number;
  data: Partial<Record<ColumnKey, string>>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function truthy(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (['yes', 'true', 'y', '1'].includes(s)) return true;
  if (['no', 'false', 'n', '0'].includes(s)) return false;
  return null;
}

export const leadsImportService = {
  columns: IMPORT_COLUMNS,

  // Validate a CSV against the database. Returns everything the UI needs to
  // tell the user exactly which cell to fix.
  async analyse(csvText: string) {
    const rows = parseCsv(csvText);
    const issues: RowIssue[] = [];

    if (!rows.length) {
      return { totalRows: 0, readyCount: 0, issues: [{ row: 1, column: 'File', value: '', message: 'The file is empty.' }], duplicates: [], unknownHeaders: [], ready: [] };
    }

    // ── header mapping ──
    const rawHeaders = rows[0];
    const mapped = rawHeaders.map((h) => HEADER_LOOKUP.get(norm(h)) ?? null);
    const unknownHeaders = rawHeaders.filter((h, i) => h.trim() !== '' && mapped[i] === null);
    if (!mapped.includes('firstName')) {
      issues.push({ row: 1, column: 'First name', value: rawHeaders.join(', '), message: 'Missing required column "First name". Download the template to see the expected headers.' });
    }
    if (!mapped.includes('email') && !mapped.includes('phone')) {
      issues.push({ row: 1, column: 'Email / Phone', value: rawHeaders.join(', '), message: 'The file needs an "Email" column, a "Phone" column, or both.' });
    }
    if (issues.length) {
      return { totalRows: Math.max(0, rows.length - 1), readyCount: 0, issues, duplicates: [], unknownHeaders, ready: [] };
    }

    const parsed: ParsedRow[] = rows.slice(1).map((cells, i) => {
      const data: Partial<Record<ColumnKey, string>> = {};
      mapped.forEach((key, col) => {
        if (!key) return;
        const v = (cells[col] ?? '').trim();
        if (v) data[key] = v;
      });
      return { row: i + 2, data }; // +2: 1-based, and row 1 is the header
    });

    // ── reference data for name/email lookups ──
    const [stages, sources, users] = await Promise.all([
      prisma.pipelineStage.findMany({ where: { track: 'LEAD' }, select: { id: true, name: true } }),
      prisma.leadSource.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, email: true } }),
    ]);
    const stageBy = new Map(stages.map((s) => [norm(s.name), s]));
    const sourceBy = new Map(sources.map((s) => [norm(s.name), s]));
    const userBy = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    const ready: {
      row: number;
      values: Record<string, unknown>;
      notes?: string;
      stageId?: string;
      leadSourceId?: string;
      assignedToId?: string;
    }[] = [];

    // Duplicates inside the file itself, plus against the database.
    const seenInFile = new Map<string, number>();
    const emails = parsed.map((r) => r.data.email?.toLowerCase()).filter(Boolean) as string[];
    const phones = parsed.map((r) => r.data.phone).filter(Boolean) as string[];
    const existing = await prisma.lead.findMany({
      where: { deletedAt: null, OR: [{ email: { in: emails } }, { phone: { in: phones } }] },
      select: { id: true, email: true, phone: true },
    });
    const existingEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e.id]));
    const existingPhone = new Map(existing.filter((e) => e.phone).map((e) => [e.phone!, e.id]));
    const duplicates: { row: number; identifier: string; reason: string }[] = [];

    for (const { row, data } of parsed) {
      const rowIssues: RowIssue[] = [];
      const bad = (column: string, value: string, message: string) => rowIssues.push({ row, column, value, message });

      if (!data.firstName) bad('First name', '', 'Required — every lead needs a name.');
      if (!data.email && !data.phone) bad('Email / Phone', '', 'Provide an email address, a phone number, or both.');
      if (data.email && !EMAIL_RE.test(data.email)) bad('Email', data.email, 'Not a valid email address.');
      if (data.state && !AU_STATES.includes(data.state.toUpperCase())) bad('State', data.state, `Use one of: ${AU_STATES.join(', ')}.`);
      if (data.status && !STATUSES.includes(data.status.toUpperCase())) bad('Status', data.status, `Use one of: ${STATUSES.join(', ')}.`);
      if (data.priority && !PRIORITIES.includes(data.priority.toUpperCase())) bad('Priority', data.priority, `Use one of: ${PRIORITIES.join(', ')}.`);
      if (data.nextFollowUpAt && (!DATE_RE.test(data.nextFollowUpAt) || Number.isNaN(Date.parse(data.nextFollowUpAt))))
        bad('Next follow-up', data.nextFollowUpAt, 'Use the format YYYY-MM-DD (e.g. 2026-09-01).');
      if (data.consentMarketing && truthy(data.consentMarketing) === null)
        bad('Marketing consent', data.consentMarketing, 'Use Yes or No.');

      const stage = data.stage ? stageBy.get(norm(data.stage)) : undefined;
      if (data.stage && !stage) bad('Stage', data.stage, `No such stage. Available: ${stages.map((s) => s.name).join(', ')}.`);

      const source = data.source ? sourceBy.get(norm(data.source)) : undefined;
      if (data.source && !source) bad('Source', data.source, `No such source. Available: ${sources.map((s) => s.name).join(', ')}.`);

      const assignee = data.assignedTo ? userBy.get(data.assignedTo.toLowerCase()) : undefined;
      if (data.assignedTo && !assignee) bad('Assigned to', data.assignedTo, 'No active user with that email address.');

      // Duplicate checks (warnings — these rows are skipped, not failed).
      const key = (data.email?.toLowerCase() || data.phone || '').trim();
      let duplicate: string | null = null;
      if (key && seenInFile.has(key)) duplicate = `Same email/phone as row ${seenInFile.get(key)} in this file.`;
      else if (data.email && existingEmail.has(data.email.toLowerCase())) duplicate = 'A lead with this email already exists.';
      else if (data.phone && existingPhone.has(data.phone)) duplicate = 'A lead with this phone number already exists.';
      if (key && !seenInFile.has(key)) seenInFile.set(key, row);

      if (rowIssues.length) {
        issues.push(...rowIssues);
        continue;
      }
      if (duplicate) {
        duplicates.push({ row, identifier: data.email ?? data.phone ?? '', reason: duplicate });
        continue;
      }

      ready.push({
        row,
        values: {
          firstName: data.firstName!,
          lastName: data.lastName ?? '',
          email: data.email?.toLowerCase() ?? null,
          phone: data.phone ?? null,
          secondaryPhone: data.secondaryPhone ?? null,
          addressLine: data.addressLine ?? null,
          suburb: data.suburb ?? null,
          state: data.state?.toUpperCase() ?? null,
          postcode: data.postcode ?? null,
          status: (data.status?.toUpperCase() ?? 'OPEN') as Prisma.LeadCreateInput['status'],
          priority: (data.priority?.toUpperCase() ?? 'MEDIUM') as Prisma.LeadCreateInput['priority'],
          estimatedSystemSize: data.estimatedSystemSize ?? null,
          propertyType: data.propertyType ?? null,
          roofType: data.roofType ?? null,
          consentMarketing: data.consentMarketing ? truthy(data.consentMarketing)! : false,
          nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null,
        },
        notes: data.notes,
        stageId: stage?.id,
        leadSourceId: source?.id,
        assignedToId: assignee?.id,
      });
    }

    return {
      totalRows: parsed.length,
      readyCount: ready.length,
      issues: issues.sort((a, b) => a.row - b.row),
      duplicates,
      unknownHeaders,
      ready,
    };
  },

  // Commit the rows that passed validation. Rows with issues and duplicates are
  // never written — the caller has already been shown them.
  async commit(auth: AuthContext, csvText: string) {
    const report = await this.analyse(csvText);
    if (!report.ready.length) return { ...report, imported: 0 };

    const defaultStage =
      (await prisma.pipelineStage.findFirst({ where: { track: 'LEAD', isDefault: true } })) ??
      (await prisma.pipelineStage.findFirst({ where: { track: 'LEAD' }, orderBy: { order: 'asc' } }));
    const autoAssign = await settingsService.autoAssignEnabled();

    let imported = 0;
    for (const r of report.ready) {
      // Explicit "Assigned to" wins; otherwise fall back to round-robin when the
      // admin has it enabled.
      const assignedToId = r.assignedToId ?? (autoAssign ? await pickRoundRobinAssignee(auth.officeId) : null);
      const officeId = assignedToId
        ? (await prisma.user.findUnique({ where: { id: assignedToId }, select: { officeId: true } }))?.officeId ?? auth.officeId
        : auth.officeId;

      const lead = await prisma.lead.create({
        data: {
          ...(r.values as object),
          stageId: r.stageId ?? defaultStage?.id,
          leadSourceId: r.leadSourceId,
          assignedToId,
          officeId,
          createdById: auth.userId,
        } as Prisma.LeadUncheckedCreateInput,
      });
      imported++;

      await prisma.leadActivity.create({
        data: { leadId: lead.id, userId: auth.userId, type: 'SYSTEM', subject: 'Lead imported', body: `Imported from CSV (row ${r.row}).` },
      });
      if (r.notes) await prisma.leadNote.create({ data: { leadId: lead.id, authorId: auth.userId, body: r.notes } });
      if (assignedToId) {
        await prisma.leadAssignment.create({
          data: { leadId: lead.id, assignedToId, assignedById: auth.userId, method: r.assignedToId ? 'MANUAL' : 'AUTO_ROUND_ROBIN' },
        });
        void notificationService
          .onLeadAssigned({ id: lead.id, firstName: lead.firstName, lastName: lead.lastName, suburb: lead.suburb }, assignedToId)
          .catch(() => undefined);
      }
    }
    return { ...report, imported };
  },
};
