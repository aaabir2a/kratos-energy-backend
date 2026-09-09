import { describe, it, expect } from 'vitest';
import { mergeDataForDeal, renderTemplate, unknownMergeFields } from './merge';

// The won-deal confirmation quotes prices back to a customer, so these values
// have to be the snapshot the deal holds — not anything recomputed.

const deal = {
  dealNumber: 42,
  value: 14990,
  expectedCloseDate: new Date('2026-10-15T00:00:00Z'),
  items: [
    { description: '6.6kW Solar System', quantity: 1, unitPrice: 9990, lineTotal: 9990 },
    { description: 'Battery module', quantity: 2, unitPrice: 2500, lineTotal: 5000 },
  ],
};

describe('mergeDataForDeal', () => {
  it('formats the deal number the way staff say it', () => {
    expect(mergeDataForDeal(deal).dealNumber).toBe('D-42');
  });

  it('formats the value as Australian currency', () => {
    expect(mergeDataForDeal(deal).dealValue).toBe('$14,990');
  });

  it('lists each line item with quantity and line total', () => {
    const items = mergeDataForDeal(deal).dealItems ?? '';
    expect(items).toContain('1 × 6.6kW Solar System — $9,990');
    expect(items).toContain('2 × Battery module — $5,000');
  });

  // Prices are snapshots. Using the unit price twice, or recomputing from the
  // catalog, would quote the customer a number they never agreed to.
  it('uses the stored line total, not quantity times unit price', () => {
    const discounted = {
      ...deal,
      items: [{ description: 'Discounted system', quantity: 2, unitPrice: 5000, lineTotal: 8000 }],
    };
    expect(mergeDataForDeal(discounted).dealItems).toContain('$8,000');
    expect(mergeDataForDeal(discounted).dealItems).not.toContain('$10,000');
  });

  it('handles Prisma Decimal values arriving as strings', () => {
    const asStrings = {
      dealNumber: 7,
      value: '2500.50' as unknown as number,
      items: [{ description: 'Inverter', quantity: 1, unitPrice: '2500.50', lineTotal: '2500.50' }],
    };
    expect(mergeDataForDeal(asStrings).dealValue).toBe('$2,500.5');
  });

  it('formats the expected close date in full', () => {
    expect(mergeDataForDeal(deal).expectedCloseDate).toContain('October');
  });

  it('leaves items undefined for a deal with none, so the fallback applies', () => {
    const bare = { dealNumber: 1, value: 0, items: [] };
    expect(mergeDataForDeal(bare).dealItems).toBeUndefined();
    expect(renderTemplate('You ordered {{dealItems}}', mergeDataForDeal(bare))).toBe('You ordered your system');
  });

  it('leaves the close date undefined when the deal has none', () => {
    expect(mergeDataForDeal({ dealNumber: 1, value: 0 }).expectedCloseDate).toBeUndefined();
  });
});

describe('deal fields in templates', () => {
  it('renders a confirmation with real numbers', () => {
    const body = renderTemplate(
      '<p>Thanks! {{dealNumber}} is confirmed at {{dealValue}}.</p>',
      mergeDataForDeal(deal),
    );
    expect(body).toBe('<p>Thanks! D-42 is confirmed at $14,990.</p>');
  });

  it('accepts the deal fields as known, so a quote template saves', () => {
    expect(unknownMergeFields('{{dealNumber}} {{dealValue}} {{dealItems}} {{expectedCloseDate}}')).toEqual([]);
  });

  // A lead-triggered template using a deal field is not an error — it renders
  // the fallback rather than blocking the save.
  it('falls back when a deal field is used without a deal', () => {
    expect(renderTemplate('About {{dealNumber}}', {})).toBe('About your quote');
  });
});
