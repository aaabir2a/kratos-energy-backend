import { describe, it, expect } from 'vitest';
import { renderTemplate, usedMergeFields, unknownMergeFields, mergeDataForLead } from './merge';

describe('renderTemplate', () => {
  it('substitutes a known field', () => {
    expect(renderTemplate('Hi {{firstName}},', { firstName: 'Jordan' })).toBe('Hi Jordan,');
  });

  it('tolerates spaces inside the braces', () => {
    expect(renderTemplate('Hi {{ firstName }}', { firstName: 'Jordan' })).toBe('Hi Jordan');
  });

  it('substitutes every occurrence', () => {
    expect(renderTemplate('{{firstName}} {{firstName}}', { firstName: 'Jo' })).toBe('Jo Jo');
  });

  // The "Hi ," bug this fallback exists to prevent.
  it('falls back when the value is missing, null or empty', () => {
    expect(renderTemplate('Hi {{firstName}},', {})).toBe('Hi there,');
    expect(renderTemplate('Hi {{firstName}},', { firstName: null })).toBe('Hi there,');
    expect(renderTemplate('Hi {{firstName}},', { firstName: '' })).toBe('Hi there,');
  });

  it('uses the per-field fallback, not one generic word', () => {
    expect(renderTemplate('in {{suburb}}', {})).toBe('in your area');
    expect(renderTemplate('from {{repName}}', {})).toBe('from the Kratos team');
  });

  it('leaves an unknown field visible so a typo is caught in preview', () => {
    expect(renderTemplate('Hi {{frstName}}', { firstName: 'Jordan' })).toBe('Hi {{frstName}}');
  });

  it('escapes substituted values in HTML mode', () => {
    expect(renderTemplate('<p>{{firstName}}</p>', { firstName: '<script>x</script>' })).toBe(
      '<p>&lt;script&gt;x&lt;/script&gt;</p>',
    );
  });

  it('does not escape in plain-text mode', () => {
    expect(renderTemplate('{{firstName}}', { firstName: "O'Brien & Sons" }, { escape: false })).toBe(
      "O'Brien & Sons",
    );
  });

  it('escapes quotes and ampersands in HTML mode', () => {
    expect(renderTemplate('{{lastName}}', { lastName: `Smith & "Co"` })).toBe('Smith &amp; &quot;Co&quot;');
  });

  it('leaves copy with no fields untouched', () => {
    const copy = '<p>Hello from Kratos. 100% no braces here.</p>';
    expect(renderTemplate(copy, {})).toBe(copy);
  });

  it('ignores a single brace pair', () => {
    expect(renderTemplate('a {firstName} b', { firstName: 'Jo' })).toBe('a {firstName} b');
  });
});

describe('usedMergeFields', () => {
  it('lists fields in first-appearance order without duplicates', () => {
    expect(usedMergeFields('{{suburb}} {{firstName}} {{suburb}}')).toEqual(['suburb', 'firstName']);
  });

  it('returns nothing for copy with no fields', () => {
    expect(usedMergeFields('plain copy')).toEqual([]);
  });
});

describe('unknownMergeFields', () => {
  it('flags only fields we cannot fill', () => {
    expect(unknownMergeFields('{{firstName}} {{nope}}')).toEqual(['nope']);
  });

  it('accepts every field offered in the picker', () => {
    expect(unknownMergeFields('{{firstName}}{{lastName}}{{fullName}}{{suburb}}{{state}}')).toEqual([]);
  });
});

describe('mergeDataForLead', () => {
  it('builds full name and lower-cases the enquiry type for use mid-sentence', () => {
    const data = mergeDataForLead({
      firstName: 'Jordan',
      lastName: 'Reid',
      suburb: 'Penrith',
      state: 'NSW',
      enquiryType: 'COMMERCIAL',
      assignedTo: { firstName: 'Sam', lastName: 'Taylor' },
    });
    expect(data.fullName).toBe('Jordan Reid');
    expect(data.enquiryType).toBe('commercial');
    expect(data.repName).toBe('Sam Taylor');
  });

  it('leaves an unassigned lead without a rep name so the fallback applies', () => {
    const data = mergeDataForLead({ firstName: 'Jordan', lastName: 'Reid', assignedTo: null });
    expect(data.repName).toBeUndefined();
    expect(renderTemplate('from {{repName}}', data)).toBe('from the Kratos team');
  });
});
