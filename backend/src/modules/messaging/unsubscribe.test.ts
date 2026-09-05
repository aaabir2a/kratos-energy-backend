import { describe, it, expect } from 'vitest';
import { makeUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';

// These tokens sit in customer inboxes indefinitely and are the only thing
// standing between an anonymous caller and someone else's subscription, so
// forgery resistance gets more attention than the happy path.

describe('makeUnsubscribeToken / verifyUnsubscribeToken', () => {
  it('round-trips channel and address', () => {
    const token = makeUnsubscribeToken('EMAIL', 'jo@example.com');
    expect(verifyUnsubscribeToken(token)).toEqual({ channel: 'EMAIL', address: 'jo@example.com', leadId: undefined });
  });

  it('carries the lead id when given one', () => {
    const token = makeUnsubscribeToken('EMAIL', 'jo@example.com', 'lead-1');
    expect(verifyUnsubscribeToken(token)?.leadId).toBe('lead-1');
  });

  // Suppression is keyed on the normalised address, so the token must be too,
  // or unsubscribing would record an address the sender never checks.
  it('normalises the address before signing', () => {
    const token = makeUnsubscribeToken('EMAIL', '  Jo@Example.COM ');
    expect(verifyUnsubscribeToken(token)?.address).toBe('jo@example.com');
  });

  it('is stable for the same address', () => {
    expect(makeUnsubscribeToken('EMAIL', 'a@b.com')).toBe(makeUnsubscribeToken('EMAIL', 'a@b.com'));
  });

  it('differs per address', () => {
    expect(makeUnsubscribeToken('EMAIL', 'a@b.com')).not.toBe(makeUnsubscribeToken('EMAIL', 'c@d.com'));
  });

  it('differs per channel', () => {
    expect(makeUnsubscribeToken('EMAIL', 'a@b.com')).not.toBe(makeUnsubscribeToken('SMS', 'a@b.com'));
  });
});

describe('token cannot be forged', () => {
  const valid = makeUnsubscribeToken('EMAIL', 'victim@example.com');

  it('rejects a tampered payload with the original signature', () => {
    const [, signature] = valid.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ c: 'EMAIL', a: 'someone-else@example.com' })).toString(
      'base64url',
    );
    expect(verifyUnsubscribeToken(`${forgedBody}.${signature}`)).toBeNull();
  });

  it('rejects an unsigned payload', () => {
    const body = Buffer.from(JSON.stringify({ c: 'EMAIL', a: 'x@y.com' })).toString('base64url');
    expect(verifyUnsubscribeToken(body)).toBeNull();
  });

  it('rejects a mangled signature', () => {
    const [body, signature] = valid.split('.');
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(verifyUnsubscribeToken(`${body}.${flipped}`)).toBeNull();
  });

  it('rejects a truncated signature', () => {
    const [body, signature] = valid.split('.');
    expect(verifyUnsubscribeToken(`${body}.${signature.slice(0, 10)}`)).toBeNull();
  });

  it('rejects junk', () => {
    for (const junk of ['', '.', 'abc', 'a.b', '....', 'null.null']) {
      expect(verifyUnsubscribeToken(junk), junk).toBeNull();
    }
  });

  it('rejects a validly signed payload with an unknown channel', () => {
    // Signed by us, but for a channel we do not send on — must not be trusted.
    const token = makeUnsubscribeToken('EMAIL', 'x@y.com');
    const [, signature] = token.split('.');
    const body = Buffer.from(JSON.stringify({ c: 'CARRIER_PIGEON', a: 'x@y.com' })).toString('base64url');
    expect(verifyUnsubscribeToken(`${body}.${signature}`)).toBeNull();
  });

  it('rejects a body that is not JSON', () => {
    const body = Buffer.from('not json at all').toString('base64url');
    expect(verifyUnsubscribeToken(`${body}.anything`)).toBeNull();
  });
});
