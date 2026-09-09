import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { parseCsv } from '../../shared/utils/csv';
import { normaliseAddress } from '../messaging/outbox.service';
import { contactsService } from './contacts.service';
import type { ImportMapping } from './marketing.schema';

// CSV import. Parsed on the server: a 20,000-row file parsed in the browser
// blocks the tab, and doing it here means an API import later needs no second
// implementation.

const MAX_ROWS = 20_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Columns we recognise without being told, matched loosely. */
const KNOWN: Record<string, 'email' | 'firstName' | 'lastName'> = {
  email: 'email',
  emailaddress: 'email',
  'e-mail': 'email',
  mail: 'email',
  firstname: 'firstName',
  first: 'firstName',
  givenname: 'firstName',
  lastname: 'lastName',
  last: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
};

const loosen = (header: string) => header.toLowerCase().replace(/[\s_.-]/g, '');

export interface ImportPreview {
  headers: string[];
  /** Our guess at what each column is, for the mapping step. */
  suggested: Record<string, 'email' | 'firstName' | 'lastName' | 'custom'>;
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: { invalidEmail: number; duplicateInFile: number; suppressed: number };
  /** Up to twenty examples, so a bad file can be diagnosed without guessing. */
  rejectedExamples: { row: number; value: string; reason: string }[];
}

export const importService = {
  /** Read the file, name the columns, and show the first rows back. */
  preview(csv: string): ImportPreview {
    const rows = parseCsv(csv).filter((r) => r.some((cell) => cell.trim() !== ''));
    if (!rows.length) throw AppError.badRequest('That file has no rows');

    const headers = rows[0].map((h) => h.trim());
    if (!headers.length) throw AppError.badRequest('That file has no header row');

    const suggested: ImportPreview['suggested'] = {};
    for (const header of headers) {
      suggested[header] = KNOWN[loosen(header)] ?? 'custom';
    }
    if (!Object.values(suggested).includes('email')) {
      throw AppError.badRequest(
        'No email column found. Rename a column to "Email", or map one on the next step.',
      );
    }

    const body = rows.slice(1);
    const sampleRows = body.slice(0, 5).map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        record[h] = (row[i] ?? '').trim();
      });
      return record;
    });

    return { headers, suggested, sampleRows, totalRows: body.length };
  },

  /**
   * Import against a mapping. Deduplicates within the file and against
   * existing contacts, and reports what it refused rather than dropping rows
   * quietly.
   */
  async import(csv: string, mapping: ImportMapping): Promise<ImportResult> {
    const list = await contactsService.getList(mapping.listId);

    const rows = parseCsv(csv).filter((r) => r.some((cell) => cell.trim() !== ''));
    const headers = rows[0].map((h) => h.trim());
    const body = rows.slice(1);

    if (body.length > MAX_ROWS) {
      throw AppError.badRequest(`That file has ${body.length} rows. Split it — the limit is ${MAX_ROWS}.`);
    }

    const emailIndex = headers.findIndex((h) => mapping.mapping[h] === 'email');
    if (emailIndex === -1) throw AppError.badRequest('Map one column to Email before importing');

    const result: ImportResult = {
      imported: 0,
      updated: 0,
      skipped: { invalidEmail: 0, duplicateInFile: 0, suppressed: 0 },
      rejectedExamples: [],
    };
    const reject = (row: number, value: string, reason: string) => {
      if (result.rejectedExamples.length < 20) result.rejectedExamples.push({ row, value, reason });
    };

    // Pass one: clean, validate and de-duplicate the file itself.
    const seen = new Set<string>();
    const candidates: { email: string; firstName?: string; lastName?: string; custom: Record<string, string> }[] = [];

    body.forEach((row, i) => {
      const rowNumber = i + 2; // 1-indexed, plus the header
      const raw = (row[emailIndex] ?? '').trim();
      if (!EMAIL_RE.test(raw)) {
        result.skipped.invalidEmail += 1;
        reject(rowNumber, raw || '(empty)', 'Not a valid email address');
        return;
      }
      const email = normaliseAddress('EMAIL', raw);
      if (seen.has(email)) {
        result.skipped.duplicateInFile += 1;
        reject(rowNumber, email, 'Appears earlier in the same file');
        return;
      }
      seen.add(email);

      const custom: Record<string, string> = {};
      let firstName: string | undefined;
      let lastName: string | undefined;
      headers.forEach((header, index) => {
        const value = (row[index] ?? '').trim();
        if (!value) return;
        switch (mapping.mapping[header]) {
          case 'firstName': firstName = value; break;
          case 'lastName': lastName = value; break;
          case 'custom': custom[header] = value; break;
          default: break; // email and ignore
        }
      });

      candidates.push({ email, firstName, lastName, custom });
    });

    if (!candidates.length) return result;

    // Suppressed addresses are still imported — the contact exists, it simply
    // cannot be emailed. Deleting them would lose the record of the
    // unsubscribe if the same file were imported again.
    const blocked = await prisma.messageSuppression.findMany({
      where: { channel: 'EMAIL', address: { in: candidates.map((c) => c.email) } },
      select: { address: true },
    });
    const blockedSet = new Set(blocked.map((b) => b.address));
    result.skipped.suppressed = blockedSet.size;

    const existing = await prisma.marketingContact.findMany({
      where: { email: { in: candidates.map((c) => c.email) } },
      select: { email: true },
    });
    const existingSet = new Set(existing.map((e) => e.email));

    // Pass two: write. Chunked so one large import does not hold a single
    // enormous transaction open.
    const CHUNK = 500;
    const customColumns = new Set(list.customColumns);

    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      for (const candidate of chunk) {
        Object.keys(candidate.custom).forEach((k) => customColumns.add(k));
        await contactsService.upsertContact({
          email: candidate.email,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          customData: candidate.custom,
          listIds: [mapping.listId],
        });
        if (existingSet.has(candidate.email)) result.updated += 1;
        else result.imported += 1;
      }
    }

    // Remember the columns this list has seen, so the table can show them and
    // a template can offer them as merge fields.
    await prisma.contactList.update({
      where: { id: mapping.listId },
      data: { customColumns: [...customColumns] as Prisma.ContactListUpdateInput['customColumns'] },
    });

    return result;
  },
};
