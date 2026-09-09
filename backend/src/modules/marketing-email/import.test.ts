import { describe, it, expect } from 'vitest';
import { importService } from './import.service';
import { createContactSchema, importMappingSchema, contactQuerySchema } from './marketing.schema';

// The import is where a bad file turns into bad data quietly, so the parsing
// and column-guessing get the most attention here. The database half is
// covered by the stage checkpoint.

const csv = (rows: string[]) => rows.join('\r\n');

describe('import preview', () => {
  it('recognises an email column by name', () => {
    const p = importService.preview(csv(['Email,First name', 'jo@example.com,Jo']));
    expect(p.suggested['Email']).toBe('email');
    expect(p.suggested['First name']).toBe('firstName');
  });

  it('recognises common header spellings', () => {
    const p = importService.preview(csv(['E-Mail,Given Name,Surname', 'a@b.com,A,B']));
    expect(p.suggested['E-Mail']).toBe('email');
    expect(p.suggested['Given Name']).toBe('firstName');
    expect(p.suggested['Surname']).toBe('lastName');
  });

  it('treats anything unrecognised as a custom column', () => {
    const p = importService.preview(csv(['Email,Company,Plan', 'a@b.com,Acme,Pro']));
    expect(p.suggested['Company']).toBe('custom');
    expect(p.suggested['Plan']).toBe('custom');
  });

  it('refuses a file with no email column, rather than importing nothing', () => {
    expect(() => importService.preview(csv(['Name,Company', 'Jo,Acme']))).toThrow(/email column/i);
  });

  it('refuses an empty file', () => {
    expect(() => importService.preview('')).toThrow(/no rows/i);
  });

  it('ignores blank lines, which trail most exported files', () => {
    const p = importService.preview(csv(['Email', 'a@b.com', '', '  ', 'c@d.com']));
    expect(p.totalRows).toBe(2);
  });

  it('returns up to five sample rows keyed by header', () => {
    const p = importService.preview(
      csv(['Email,Company', ...Array.from({ length: 9 }, (_, i) => `p${i}@x.com,Acme`)]),
    );
    expect(p.sampleRows).toHaveLength(5);
    expect(p.sampleRows[0]).toEqual({ Email: 'p0@x.com', Company: 'Acme' });
    expect(p.totalRows).toBe(9);
  });

  it('handles quoted fields containing commas', () => {
    const p = importService.preview(csv(['Email,Company', 'a@b.com,"Acme, Inc"']));
    expect(p.sampleRows[0].Company).toBe('Acme, Inc');
  });

  it('strips the BOM Excel writes, so the first header still matches', () => {
    const p = importService.preview('﻿Email,First name\r\na@b.com,Jo');
    expect(p.suggested['Email']).toBe('email');
  });
});

describe('import mapping payload', () => {
  const listId = '11111111-1111-4111-8111-111111111111';

  it('accepts a mapping of headers to fields', () => {
    const parsed = importMappingSchema.safeParse({
      listId,
      mapping: { Email: 'email', Company: 'custom', Notes: 'ignore' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown target field', () => {
    const parsed = importMappingSchema.safeParse({ listId, mapping: { Email: 'phone_number' } });
    expect(parsed.success).toBe(false);
  });

  it('requires a list to import into', () => {
    expect(importMappingSchema.safeParse({ mapping: { Email: 'email' } }).success).toBe(false);
  });
});

describe('contact payload', () => {
  it('requires a valid email', () => {
    expect(createContactSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(createContactSchema.safeParse({ email: 'jo@example.com' }).success).toBe(true);
  });

  it('accepts custom fields and list membership', () => {
    const parsed = createContactSchema.parse({
      email: 'jo@example.com',
      customData: { company: 'Acme' },
      listIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(parsed.customData?.company).toBe('Acme');
  });

  it('coerces the suppressed-only filter from its query string', () => {
    expect(contactQuerySchema.parse({ suppressedOnly: 'true' }).suppressedOnly).toBe(true);
    expect(contactQuerySchema.parse({ suppressedOnly: 'false' }).suppressedOnly).toBe(false);
    expect(contactQuerySchema.parse({}).suppressedOnly).toBeUndefined();
  });
});
