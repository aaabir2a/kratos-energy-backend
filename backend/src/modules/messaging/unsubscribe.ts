import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MessageChannel } from '@prisma/client';
import { env } from '../../core/config/env';
import { normaliseAddress } from './outbox.service';

// Unsubscribe links are signed, not stored.
//
// A token carries the channel and address and is verified by signature, so
// there is no lookup table to grow, nothing to expire, and no way to enumerate
// other people's links by guessing ids. The trade-off is that a token cannot be
// revoked individually — rotating the secret invalidates every link at once,
// which is why UNSUBSCRIBE_SECRET is separate from the JWT secret.

interface TokenPayload {
  c: MessageChannel;
  a: string;
  /** Lead id, so an unsubscribe can be attributed to a person. */
  l?: string;
}

function secret(): string {
  if (env.UNSUBSCRIBE_SECRET) return env.UNSUBSCRIBE_SECRET;
  // Domain-separated fallback so this key is never the JWT signing key itself.
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update('unsubscribe').digest('hex');
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function sign(body: string): string {
  return b64url(createHmac('sha256', secret()).update(body).digest());
}

export function makeUnsubscribeToken(
  channel: MessageChannel,
  address: string,
  leadId?: string | null,
): string {
  const payload: TokenPayload = { c: channel, a: normaliseAddress(channel, address) };
  if (leadId) payload.l = leadId;
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export interface VerifiedToken {
  channel: MessageChannel;
  address: string;
  leadId?: string;
}

/** Returns null for anything that is not a token we signed. */
export function verifyUnsubscribeToken(token: string): VerifiedToken | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    if (!payload.a || (payload.c !== 'EMAIL' && payload.c !== 'SMS')) return null;
    return { channel: payload.c, address: payload.a, leadId: payload.l };
  } catch {
    return null;
  }
}

/** The link that goes in the footer of customer mail. */
export function unsubscribeUrl(channel: MessageChannel, address: string, leadId?: string | null): string | null {
  if (!env.APP_BASE_URL) return null;
  const token = makeUnsubscribeToken(channel, address, leadId);
  return `${env.APP_BASE_URL.replace(/\/$/, '')}/unsubscribe/${token}`;
}
