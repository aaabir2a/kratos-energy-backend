import { describe, it, expect } from 'vitest';
import { createTemplateSchema, updateTemplateSchema, listTemplatesQuerySchema } from './messaging.schema';

describe('createTemplateSchema', () => {
  it('accepts a minimal template', () => {
    const parsed = createTemplateSchema.parse({ name: 'Referral offer', bodyHtml: '<p>Hi</p>' });
    expect(parsed.name).toBe('Referral offer');
  });

  it('rejects an empty body — an empty email is never intentional', () => {
    expect(createTemplateSchema.safeParse({ name: 'x', bodyHtml: '' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(createTemplateSchema.safeParse({ name: '', bodyHtml: '<p>x</p>' }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    const result = createTemplateSchema.safeParse({ name: 'x', bodyHtml: '<p>x</p>', category: 'NEWSLETTER' });
    expect(result.success).toBe(false);
  });

  it('accepts both channels', () => {
    for (const channel of ['EMAIL', 'SMS'] as const) {
      expect(createTemplateSchema.safeParse({ name: 'x', bodyHtml: 'x', channel }).success).toBe(true);
    }
  });
});

describe('updateTemplateSchema', () => {
  it('allows a partial update', () => {
    expect(updateTemplateSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('allows an empty patch', () => {
    expect(updateTemplateSchema.safeParse({}).success).toBe(true);
  });

  it('still rejects an explicitly empty body', () => {
    expect(updateTemplateSchema.safeParse({ bodyHtml: '' }).success).toBe(false);
  });
});

describe('listTemplatesQuerySchema', () => {
  it('coerces paging numbers from query strings', () => {
    const parsed = listTemplatesQuerySchema.parse({ page: '2', limit: '50' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
  });

  it('turns the isActive string into a boolean', () => {
    expect(listTemplatesQuerySchema.parse({ isActive: 'true' }).isActive).toBe(true);
    expect(listTemplatesQuerySchema.parse({ isActive: 'false' }).isActive).toBe(false);
  });

  it('leaves isActive undefined when absent, so the list is unfiltered', () => {
    expect(listTemplatesQuerySchema.parse({}).isActive).toBeUndefined();
  });
});
