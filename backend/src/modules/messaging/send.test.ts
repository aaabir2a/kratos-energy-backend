import { describe, it, expect } from 'vitest';
import { sendService, REP_RECIPIENT_CAP } from './send.service';
import { sendSchema, sendPreviewSchema } from './messaging.schema';
import type { AuthContext } from '../leads/leads.scope';

const auth = (permissions: string[], role = 'sales'): AuthContext => ({
  userId: '00000000-0000-4000-8000-000000000001',
  officeId: null,
  role,
  permissions,
});

describe('recipient cap', () => {
  // Q5 in the build plan: reps send from templates in small numbers, marketing
  // sends to a list.
  it('caps a rep who can send but not author', () => {
    expect(sendService.capFor(auth(['messaging.read', 'messaging.send']))).toBe(REP_RECIPIENT_CAP);
  });

  it('does not cap someone who can author templates', () => {
    expect(sendService.capFor(auth(['messaging.send', 'messaging.write'], 'marketing'))).toBeNull();
  });

  it('does not cap an admin holding the wildcard', () => {
    expect(sendService.capFor(auth(['*.*'], 'admin'))).toBeNull();
  });
});

describe('screening', () => {
  const lead = (id: string, email: string | null) =>
    ({
      id,
      firstName: 'A',
      lastName: 'B',
      email,
      suburb: null,
      state: null,
      enquiryType: 'RESIDENTIAL',
      officeId: null,
      assignedTo: null,
    }) as never;

  it('counts a lead with no email as skipped rather than failing the send', async () => {
    // No suppressions are looked up when nobody has an address.
    const { screening, sendable } = await sendService.screen([lead('1', null), lead('2', null)]);
    expect(screening).toEqual({ total: 2, willSend: 0, skipped: { noAddress: 2, unsubscribed: 0 } });
    expect(sendable).toHaveLength(0);
  });
});

describe('send payload validation', () => {
  const templateId = '11111111-1111-4111-8111-111111111111';
  const leadId = '22222222-2222-4222-8222-222222222222';

  it('accepts an explicit list of leads', () => {
    expect(sendPreviewSchema.safeParse({ templateId, leadIds: [leadId] }).success).toBe(true);
  });

  it('accepts a filter instead of a list', () => {
    expect(sendPreviewSchema.safeParse({ templateId, filters: { enquiryType: 'COMMERCIAL' } }).success).toBe(
      true,
    );
  });

  // Without this, an empty body would mean "everyone".
  it('refuses a send with neither leads nor filters', () => {
    expect(sendPreviewSchema.safeParse({ templateId }).success).toBe(false);
  });

  it('refuses an empty lead list', () => {
    expect(sendPreviewSchema.safeParse({ templateId, leadIds: [] }).success).toBe(false);
  });

  it('refuses more than 2000 recipients in one request', () => {
    const many = Array.from({ length: 2001 }, () => leadId);
    expect(sendPreviewSchema.safeParse({ templateId, leadIds: many }).success).toBe(false);
  });

  it('rejects a non-uuid template', () => {
    expect(sendPreviewSchema.safeParse({ templateId: 'nope', leadIds: [leadId] }).success).toBe(false);
  });

  it('accepts an optional scheduled time on the send payload', () => {
    const parsed = sendSchema.safeParse({
      templateId,
      leadIds: [leadId],
      scheduledFor: '2026-09-10T23:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a scheduled time that is not a date', () => {
    expect(sendSchema.safeParse({ templateId, leadIds: [leadId], scheduledFor: 'tomorrow' }).success).toBe(
      false,
    );
  });
});
