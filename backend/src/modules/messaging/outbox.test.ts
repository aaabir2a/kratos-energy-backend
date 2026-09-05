import { describe, it, expect } from 'vitest';
import { idempotencyKeyFor, normaliseAddress } from './outbox.service';

// The enqueue path's pure parts. The database-touching half is covered by the
// stage checkpoint script against the shared test DB.

describe('idempotencyKeyFor', () => {
  const base = { leadId: 'lead-1', toEmail: 'jo@example.com', templateId: 'tpl-1' };

  it('is stable for the same logical message', () => {
    expect(idempotencyKeyFor(base)).toBe(idempotencyKeyFor({ ...base }));
  });

  // The guarantee that stops a sequence step going out twice after a crash.
  it('is the same for a repeated enrolment step', () => {
    const step = { enrolmentId: 'enr-1', stepId: 'step-2', ...base };
    expect(idempotencyKeyFor(step)).toBe(idempotencyKeyFor({ ...step }));
  });

  it('differs per step of the same enrolment', () => {
    const one = { enrolmentId: 'enr-1', stepId: 'step-1', ...base };
    const two = { enrolmentId: 'enr-1', stepId: 'step-2', ...base };
    expect(idempotencyKeyFor(one)).not.toBe(idempotencyKeyFor(two));
  });

  it('differs per recipient in the same batch', () => {
    const a = { batchId: 'b-1', toEmail: 'a@example.com', templateId: 'tpl-1' };
    const b = { batchId: 'b-1', toEmail: 'b@example.com', templateId: 'tpl-1' };
    expect(idempotencyKeyFor(a)).not.toBe(idempotencyKeyFor(b));
  });

  it('differs per batch for the same recipient', () => {
    const first = { batchId: 'b-1', ...base };
    const second = { batchId: 'b-2', ...base };
    expect(idempotencyKeyFor(first)).not.toBe(idempotencyKeyFor(second));
  });

  // Without the template in the key, sending different copy to the same person
  // would be swallowed as a duplicate.
  it('differs when the template differs', () => {
    expect(idempotencyKeyFor({ ...base, templateId: 'tpl-1' })).not.toBe(
      idempotencyKeyFor({ ...base, templateId: 'tpl-2' }),
    );
  });

  it('differs by channel, so an email and an SMS never collide', () => {
    expect(idempotencyKeyFor({ ...base, channel: 'EMAIL' })).not.toBe(
      idempotencyKeyFor({ ...base, channel: 'SMS', toPhone: '0400000000' }),
    );
  });

  it('differs when the same message is deliberately scheduled for another time', () => {
    const monday = { ...base, scheduledFor: new Date('2026-09-07T00:00:00Z') };
    const tuesday = { ...base, scheduledFor: new Date('2026-09-08T00:00:00Z') };
    expect(idempotencyKeyFor(monday)).not.toBe(idempotencyKeyFor(tuesday));
  });

  it('honours an explicit key over the derived one', () => {
    expect(idempotencyKeyFor({ ...base, idempotencyKey: 'mine' })).toBe('mine');
  });
});

describe('normaliseAddress', () => {
  // Suppression is keyed on the normalised address, so "Jo@Example.com " must
  // not slip past an unsubscribe recorded as "jo@example.com".
  it('lower-cases and trims email', () => {
    expect(normaliseAddress('EMAIL', '  Jo@Example.COM ')).toBe('jo@example.com');
  });

  it('strips spacing and punctuation from phone numbers', () => {
    expect(normaliseAddress('SMS', '+61 (400) 123-456')).toBe('+61400123456');
  });

  it('leaves an already-clean address unchanged', () => {
    expect(normaliseAddress('EMAIL', 'jo@example.com')).toBe('jo@example.com');
    expect(normaliseAddress('SMS', '+61400123456')).toBe('+61400123456');
  });
});
