import { describe, it, expect } from 'vitest';
import { emailShell, escapeHtml, BRAND } from './templates';

describe('emailShell', () => {
  it('renders the title, every line and the brand footer', () => {
    const html = emailShell('New lead captured', ['First line.', 'Second line.']);
    expect(html).toContain('New lead captured');
    expect(html).toContain('First line.');
    expect(html).toContain('Second line.');
    expect(html).toContain(BRAND.websiteLabel);
    expect(html).toContain(BRAND.phone);
  });

  it('renders a CTA button only when the url is present', () => {
    const withCta = emailShell('T', [], { text: 'View lead', url: 'https://crm.example/leads/1' });
    expect(withCta).toContain('https://crm.example/leads/1');
    expect(withCta).toContain('View lead');

    // appLink() returns null when APP_BASE_URL is unset — no dead button.
    const withoutCta = emailShell('T', [], { text: 'View lead', url: null });
    expect(withoutCta).not.toContain('View lead');
  });

  it('defaults to the internal-notification footer', () => {
    expect(emailShell('T', [])).toContain('internal notification');
  });

  it('takes a custom footer note for customer mail', () => {
    const html = emailShell('T', [], undefined, { footerNote: 'You are receiving this as a Kratos customer.' });
    expect(html).toContain('You are receiving this as a Kratos customer.');
    expect(html).not.toContain('internal notification');
  });

  it('appends footer html, which is where the unsubscribe link will go', () => {
    const html = emailShell('T', [], undefined, { footerHtml: '<a href="https://x/u/tok">Unsubscribe</a>' });
    expect(html).toContain('https://x/u/tok');
  });

  it('produces balanced markup', () => {
    const html = emailShell('T', ['line'], { text: 'Go', url: 'https://x' });
    expect((html.match(/<div/g) ?? []).length).toBe((html.match(/<\/div>/g) ?? []).length);
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters that break markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('escapes the ampersand first so entities are not double-broken', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Penrith NSW 2750')).toBe('Penrith NSW 2750');
  });
});
