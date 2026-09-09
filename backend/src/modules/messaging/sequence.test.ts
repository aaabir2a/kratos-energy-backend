import { describe, it, expect } from 'vitest';
import {
  createSequenceSchema,
  updateSequenceSchema,
  setStepsSchema,
  sequenceStepSchema,
} from './messaging.schema';

const templateId = '11111111-1111-4111-8111-111111111111';

describe('createSequenceSchema', () => {
  it('accepts a minimal sequence', () => {
    const parsed = createSequenceSchema.parse({ name: 'New lead follow-up', trigger: 'LEAD_CREATED' });
    expect(parsed.trigger).toBe('LEAD_CREATED');
  });

  it('rejects an unknown trigger', () => {
    expect(createSequenceSchema.safeParse({ name: 'x', trigger: 'LEAD_SNEEZED' }).success).toBe(false);
  });

  it('accepts enrolment filters', () => {
    const parsed = createSequenceSchema.parse({
      name: 'Commercial only',
      trigger: 'LEAD_CREATED',
      filters: { enquiryType: 'COMMERCIAL' },
    });
    expect(parsed.filters?.enquiryType).toBe('COMMERCIAL');
  });

  it('rejects an unknown enquiry type in filters', () => {
    const result = createSequenceSchema.safeParse({
      name: 'x',
      trigger: 'LEAD_CREATED',
      filters: { enquiryType: 'INDUSTRIAL' },
    });
    expect(result.success).toBe(false);
  });

  // isActive is deliberately not settable at creation — a sequence with no
  // steps would enrol leads and send them nothing.
  it('ignores isActive on create', () => {
    const parsed = createSequenceSchema.parse({ name: 'x', trigger: 'LEAD_CREATED', isActive: true } as never);
    expect('isActive' in parsed).toBe(false);
  });
});

describe('updateSequenceSchema', () => {
  it('allows toggling active', () => {
    expect(updateSequenceSchema.parse({ isActive: true })).toEqual({ isActive: true });
  });

  it('allows clearing filters', () => {
    expect(updateSequenceSchema.safeParse({ filters: null }).success).toBe(true);
  });

  // The trigger decides what the sequence responds to; changing it under a
  // live sequence would silently repoint every future enrolment.
  it('does not allow changing the trigger', () => {
    const parsed = updateSequenceSchema.parse({ trigger: 'DEAL_WON' } as never);
    expect('trigger' in parsed).toBe(false);
  });

  it('allows turning individual stop rules off', () => {
    const parsed = updateSequenceSchema.parse({ stopOnStageChange: false });
    expect(parsed.stopOnStageChange).toBe(false);
  });
});

describe('sequence steps', () => {
  it('accepts an immediate step', () => {
    expect(sequenceStepSchema.parse({ templateId, delayMinutes: 0 }).delayMinutes).toBe(0);
  });

  it('accepts a two-day delay', () => {
    expect(sequenceStepSchema.parse({ templateId, delayMinutes: 2880 }).delayMinutes).toBe(2880);
  });

  it('rejects a negative delay, which would schedule into the past', () => {
    expect(sequenceStepSchema.safeParse({ templateId, delayMinutes: -60 }).success).toBe(false);
  });

  it('rejects a delay beyond a year', () => {
    expect(sequenceStepSchema.safeParse({ templateId, delayMinutes: 60 * 24 * 400 }).success).toBe(false);
  });

  it('rejects a fractional delay', () => {
    expect(sequenceStepSchema.safeParse({ templateId, delayMinutes: 1.5 }).success).toBe(false);
  });

  it('accepts an empty step list, which is how a sequence is emptied', () => {
    expect(setStepsSchema.parse({ steps: [] }).steps).toEqual([]);
  });

  it('caps a sequence at 20 steps', () => {
    const many = Array.from({ length: 21 }, () => ({ templateId, delayMinutes: 0 }));
    expect(setStepsSchema.safeParse({ steps: many }).success).toBe(false);
  });

  it('allows the same template at two different delays', () => {
    const steps = [
      { templateId, delayMinutes: 0 },
      { templateId, delayMinutes: 2880 },
    ];
    expect(setStepsSchema.safeParse({ steps }).success).toBe(true);
  });
});
