import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../core/config/env';

// Tracking links are signed, not stored — the same approach as the unsubscribe
// links already shipped.
//
// A token carries the message id (and, for a click, the destination) and is
// verified by signature. There is no lookup table to grow, nothing to expire,
// and no sequential id to enumerate. The secret is domain-separated from the
// unsubscribe one so a token minted for tracking can never be replayed as an
// unsubscribe, and vice versa.

type Kind = 'o' | 'c'; // open | click

interface OpenPayload {
  m: string; // message id
}

interface ClickPayload extends OpenPayload {
  u: string; // destination
}

function secret(kind: Kind): string {
  const base = env.UNSUBSCRIBE_SECRET || env.JWT_ACCESS_SECRET;
  return createHmac('sha256', base).update(`tracking:${kind}`).digest('hex');
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(kind: Kind, body: string): string {
  return b64url(createHmac('sha256', secret(kind)).update(body).digest());
}

function mint(kind: Kind, payload: OpenPayload | ClickPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(kind, body)}`;
}

function open<T>(kind: Kind, token: string): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(kind, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

export function makeOpenToken(messageId: string): string {
  return mint('o', { m: messageId });
}

export function makeClickToken(messageId: string, url: string): string {
  return mint('c', { m: messageId, u: url });
}

export function verifyOpenToken(token: string): { messageId: string } | null {
  const payload = open<OpenPayload>('o', token);
  return payload?.m ? { messageId: payload.m } : null;
}

export function verifyClickToken(token: string): { messageId: string; url: string } | null {
  const payload = open<ClickPayload>('c', token);
  if (!payload?.m || !payload.u) return null;
  // The signature already proves we minted this, but a token minted from a
  // template that somehow held a javascript: URL must still not be followed.
  return isSafeDestination(payload.u) ? { messageId: payload.m, url: payload.u } : null;
}

/** Only ever redirect to http(s). Anything else is refused outright. */
export function isSafeDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ── Link rewriting ────────────────────────────────────

/** Absolute http(s) links in an href, captured so the URL can be swapped. */
const HREF = /href\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi;

/**
 * Rewrites outbound links to the click endpoint.
 *
 * Deliberately left alone:
 *  - the unsubscribe link, which must keep working even if tracking is broken,
 *    and which no one should be counted as having "clicked through" on;
 *  - `mailto:`, `tel:` and anchors, which the pattern does not match anyway;
 *  - anything already pointing at the tracking endpoint, so a re-render cannot
 *    wrap a link twice.
 */
export function rewriteLinks(html: string, messageId: string, baseUrl: string): string {
  if (!baseUrl) return html;
  const root = baseUrl.replace(/\/$/, '');

  return html.replace(HREF, (match, quote: string, url: string) => {
    if (url.includes('/unsubscribe/') || url.includes('/public/t/')) return match;
    const decoded = url.replace(/&amp;/g, '&');
    if (!isSafeDestination(decoded)) return match;
    return `href=${quote}${root}/public/t/c/${makeClickToken(messageId, decoded)}${quote}`;
  });
}

/** The 1×1 image appended to the body, and the endpoint that records the open. */
export function trackingPixel(messageId: string, baseUrl: string): string {
  if (!baseUrl) return '';
  const root = baseUrl.replace(/\/$/, '');
  return `<img src="${root}/public/t/o/${makeOpenToken(messageId)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
}

// ── Machine detection ─────────────────────────────────

/**
 * Mail scanners, link checkers and image proxies that fetch every URL in a
 * message the moment it arrives. Counting these as people makes an open rate
 * meaningless — Apple Mail Privacy Protection alone would push it near 100%.
 */
const MACHINE_AGENTS = [
  'googleimageproxy',
  'yahoomailproxy',
  'ggpht.com',
  'proofpoint',
  'mimecast',
  'barracuda',
  'symantec',
  'forcepoint',
  'microsoft office',
  'ms-officeprotocolhandler',
  'safelinks',
  'bitdefender',
  'trendmicro',
  'sophos',
  'cloudmark',
  'urlscan',
  'slackbot',
  'whatsapp',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'discordbot',
  'telegrambot',
  'bot',
  'crawler',
  'spider',
  'curl',
  'wget',
  'python-requests',
  'go-http-client',
  'okhttp',
  'headlesschrome',
  'preview',
];

/** Anything arriving this soon after a send was opened by software, not a person. */
export const PREFETCH_WINDOW_MS = 5_000;

export interface MachineCheck {
  machine: boolean;
  reason?: string;
}

/**
 * Two independent signals, because neither is sufficient alone: Apple's
 * proxy presents an ordinary browser user agent (so only the timing catches
 * it), while a scanner that sits on a message for a minute before opening it
 * defeats the timing (so only the agent catches it).
 */
export function looksMachine(userAgent: string | undefined, sentAt: Date | null): MachineCheck {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return { machine: true, reason: 'no user agent' };

  const hit = MACHINE_AGENTS.find((needle) => ua.includes(needle));
  if (hit) return { machine: true, reason: `agent: ${hit}` };

  if (sentAt) {
    const age = Date.now() - sentAt.getTime();
    if (age >= 0 && age < PREFETCH_WINDOW_MS) {
      return { machine: true, reason: `opened ${age}ms after send` };
    }
  }
  return { machine: false };
}
