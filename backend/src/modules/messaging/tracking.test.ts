import { describe, it, expect } from 'vitest';
import {
  makeOpenToken,
  makeClickToken,
  verifyOpenToken,
  verifyClickToken,
  isSafeDestination,
  rewriteLinks,
  trackingPixel,
  looksMachine,
  PREFETCH_WINDOW_MS,
} from './tracking';

const MSG = '11111111-1111-4111-8111-111111111111';
const BASE = 'https://crm.kratos-energy.com/api/v1';

describe('tracking tokens', () => {
  it('round-trips an open token', () => {
    expect(verifyOpenToken(makeOpenToken(MSG))).toEqual({ messageId: MSG });
  });

  it('round-trips a click token with its destination', () => {
    const token = makeClickToken(MSG, 'https://kratos-energy.com/packages?a=1&b=2');
    expect(verifyClickToken(token)).toEqual({
      messageId: MSG,
      url: 'https://kratos-energy.com/packages?a=1&b=2',
    });
  });

  it('refuses a tampered payload', () => {
    const token = makeClickToken(MSG, 'https://kratos-energy.com/');
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ m: MSG, u: 'https://evil.example/' })).toString('base64url');
    expect(verifyClickToken(`${forged}.${signature}`)).toBeNull();
  });

  it('refuses a tampered signature', () => {
    const [body] = makeOpenToken(MSG).split('.');
    expect(verifyOpenToken(`${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
  });

  it('refuses junk', () => {
    for (const junk of ['', '.', 'nodot', 'a.b', '....']) {
      expect(verifyOpenToken(junk)).toBeNull();
      expect(verifyClickToken(junk)).toBeNull();
    }
  });

  // The two kinds are signed with domain-separated secrets, so one cannot be
  // presented as the other even though the payload shape overlaps.
  it('does not accept an open token at the click endpoint', () => {
    expect(verifyClickToken(makeOpenToken(MSG))).toBeNull();
  });

  it('does not accept a click token at the open endpoint', () => {
    expect(verifyOpenToken(makeClickToken(MSG, 'https://kratos-energy.com/'))).toBeNull();
  });
});

describe('redirect safety', () => {
  it('allows http and https only', () => {
    expect(isSafeDestination('https://kratos-energy.com')).toBe(true);
    expect(isSafeDestination('http://kratos-energy.com')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://x.com', '/relative', 'not a url']) {
      expect(isSafeDestination(bad)).toBe(false);
    }
  });

  // Belt and braces: even a token we signed is re-checked before redirecting,
  // so a bad URL that reached a template cannot become an open redirect.
  it('refuses a signed token carrying a javascript: url', () => {
    expect(verifyClickToken(makeClickToken(MSG, 'javascript:alert(1)'))).toBeNull();
  });
});

describe('link rewriting', () => {
  it('wraps an ordinary link', () => {
    const out = rewriteLinks('<a href="https://kratos-energy.com/solar">Solar</a>', MSG, BASE);
    expect(out).toContain(`${BASE}/public/t/c/`);
    expect(out).not.toContain('href="https://kratos-energy.com/solar"');
  });

  it('preserves the link text and surrounding markup', () => {
    const out = rewriteLinks('<p>Read <a href="https://kratos-energy.com/x">this</a> now</p>', MSG, BASE);
    expect(out).toContain('>this</a>');
    expect(out).toContain('<p>Read ');
    expect(out).toContain(' now</p>');
  });

  it('leaves the unsubscribe link alone', () => {
    const html = '<a href="https://crm.kratos-energy.com/unsubscribe/abc.def">Unsubscribe</a>';
    expect(rewriteLinks(html, MSG, BASE)).toBe(html);
  });

  it('leaves mailto and tel alone', () => {
    const html = '<a href="mailto:info@kratos-energy.com">Mail</a><a href="tel:1300">Call</a>';
    expect(rewriteLinks(html, MSG, BASE)).toBe(html);
  });

  it('does not wrap a link twice', () => {
    const once = rewriteLinks('<a href="https://kratos-energy.com/a">A</a>', MSG, BASE);
    expect(rewriteLinks(once, MSG, BASE)).toBe(once);
  });

  it('decodes &amp; so the destination is the real URL', () => {
    const out = rewriteLinks('<a href="https://kratos-energy.com/?a=1&amp;b=2">x</a>', MSG, BASE);
    const token = out.match(/\/public\/t\/c\/([^"]+)/)?.[1] ?? '';
    expect(verifyClickToken(token)?.url).toBe('https://kratos-energy.com/?a=1&b=2');
  });

  it('handles single quotes and several links', () => {
    const out = rewriteLinks(
      `<a href='https://kratos-energy.com/a'>a</a><a href="https://kratos-energy.com/b">b</a>`,
      MSG,
      BASE,
    );
    expect(out.match(/\/public\/t\/c\//g)).toHaveLength(2);
  });

  // Without a base URL there is nowhere to point, and a half-formed link in a
  // customer's inbox is worse than no tracking.
  it('is a no-op with no base url', () => {
    const html = '<a href="https://kratos-energy.com/a">a</a>';
    expect(rewriteLinks(html, MSG, '')).toBe(html);
    expect(trackingPixel(MSG, '')).toBe('');
  });

  it('builds a pixel that verifies back to the message', () => {
    const token = trackingPixel(MSG, BASE).match(/\/public\/t\/o\/([^"]+)/)?.[1] ?? '';
    expect(verifyOpenToken(token)).toEqual({ messageId: MSG });
  });
});

describe('machine detection', () => {
  const old = new Date(Date.now() - 60 * 60_000);

  it('flags a known image proxy', () => {
    expect(looksMachine('Mozilla/5.0 (via GoogleImageProxy)', old).machine).toBe(true);
  });

  it('flags a security gateway', () => {
    expect(looksMachine('Mimecast Link Checker', old).machine).toBe(true);
  });

  it('flags a missing user agent', () => {
    expect(looksMachine(undefined, old).machine).toBe(true);
    expect(looksMachine('', old).machine).toBe(true);
  });

  // Apple Mail Privacy Protection presents an ordinary browser agent, so only
  // the timing gives it away.
  it('flags an open that arrives within seconds of the send', () => {
    const justSent = new Date(Date.now() - 1_000);
    const real = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
    const check = looksMachine(real, justSent);
    expect(check.machine).toBe(true);
    expect(check.reason).toMatch(/after send/);
  });

  it('accepts the same agent once the prefetch window has passed', () => {
    const later = new Date(Date.now() - PREFETCH_WINDOW_MS - 1_000);
    const real = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
    expect(looksMachine(real, later).machine).toBe(false);
  });

  it('counts a real browser opening an old message as a person', () => {
    const real = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
    expect(looksMachine(real, old)).toEqual({ machine: false });
  });

  it('does not use timing when the message has no send time', () => {
    const real = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
    expect(looksMachine(real, null).machine).toBe(false);
  });

  it('names the reason it decided, so a wrong call can be investigated', () => {
    expect(looksMachine('curl/8.4.0', old).reason).toBe('agent: curl');
  });
});
