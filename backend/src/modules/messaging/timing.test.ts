import { describe, it, expect } from 'vitest';
import {
  localParts,
  zonedTimeToInstant,
  isWithinWindow,
  nextAllowedTime,
  retryDelayMs,
  DEFAULT_WINDOW,
  type SendingWindow,
} from './timing';

const SYD: SendingWindow = { ...DEFAULT_WINDOW, timezone: 'Australia/Sydney' };
const PER: SendingWindow = { ...DEFAULT_WINDOW, timezone: 'Australia/Perth' };

/** Helper: the instant of a Sydney wall-clock time. */
const syd = (y: number, m: number, d: number, h: number, min = 0) =>
  zonedTimeToInstant('Australia/Sydney', y, m, d, h, min);

describe('localParts', () => {
  it('reads an instant in the target zone, not the server zone', () => {
    // 2026-03-10T04:30Z is 15:30 in Sydney (AEDT, UTC+11).
    const p = localParts(new Date('2026-03-10T04:30:00Z'), 'Australia/Sydney');
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 3, 10, 15, 30]);
  });

  it('gives different wall clocks for Sydney and Perth from one instant', () => {
    const instant = new Date('2026-06-01T02:00:00Z'); // 12:00 AEST, 10:00 AWST
    expect(localParts(instant, 'Australia/Sydney').hour).toBe(12);
    expect(localParts(instant, 'Australia/Perth').hour).toBe(10);
  });

  it('normalises midnight to hour 0', () => {
    const midnight = syd(2026, 6, 10, 0);
    expect(localParts(midnight, 'Australia/Sydney').hour).toBe(0);
  });
});

describe('zonedTimeToInstant', () => {
  it('round-trips a wall-clock time through an instant', () => {
    const instant = syd(2026, 9, 8, 9, 30);
    const p = localParts(instant, 'Australia/Sydney');
    expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 9, 8, 9, 30]);
  });

  it('resolves winter time correctly (AEST, UTC+10)', () => {
    expect(syd(2026, 6, 10, 9).toISOString()).toBe('2026-06-09T23:00:00.000Z');
  });

  it('resolves summer time correctly (AEDT, UTC+11)', () => {
    expect(syd(2026, 12, 10, 9).toISOString()).toBe('2026-12-09T22:00:00.000Z');
  });

  // The reason zonedTimeToInstant does a second correction pass.
  it('lands on the right instant either side of the daylight-saving change', () => {
    // Australian DST ends the first Sunday in April 2026 (5 April).
    const beforeChange = syd(2026, 4, 3, 9); // still AEDT (+11)
    const afterChange = syd(2026, 4, 7, 9); // now AEST (+10)
    expect(localParts(beforeChange, 'Australia/Sydney').hour).toBe(9);
    expect(localParts(afterChange, 'Australia/Sydney').hour).toBe(9);
    expect(beforeChange.toISOString()).toBe('2026-04-02T22:00:00.000Z');
    expect(afterChange.toISOString()).toBe('2026-04-06T23:00:00.000Z');
  });
});

describe('isWithinWindow', () => {
  it('accepts mid-morning on a weekday', () => {
    expect(isWithinWindow(syd(2026, 9, 8, 10), SYD)).toBe(true); // Tuesday
  });

  it('rejects the small hours', () => {
    expect(isWithinWindow(syd(2026, 9, 8, 3), SYD)).toBe(false);
  });

  it('treats the opening hour as open and the closing hour as shut', () => {
    expect(isWithinWindow(syd(2026, 9, 8, 8), SYD)).toBe(true);
    expect(isWithinWindow(syd(2026, 9, 8, 18, 59), SYD)).toBe(true);
    expect(isWithinWindow(syd(2026, 9, 8, 19), SYD)).toBe(false);
  });

  it('rejects the weekend when business days only', () => {
    expect(isWithinWindow(syd(2026, 9, 12, 10), SYD)).toBe(false); // Saturday
    expect(isWithinWindow(syd(2026, 9, 13, 10), SYD)).toBe(false); // Sunday
  });

  it('allows the weekend when the office sends every day', () => {
    const everyDay = { ...SYD, businessDaysOnly: false };
    expect(isWithinWindow(syd(2026, 9, 12, 10), everyDay)).toBe(true);
  });

  it('judges the same instant differently for two offices', () => {
    // 2026-09-08T23:30Z — 09:30 Wednesday in Sydney, 07:30 in Perth.
    const instant = new Date('2026-09-08T23:30:00Z');
    expect(isWithinWindow(instant, SYD)).toBe(true);
    expect(isWithinWindow(instant, PER)).toBe(false);
  });
});

describe('nextAllowedTime', () => {
  it('leaves a time inside the window untouched', () => {
    const due = syd(2026, 9, 8, 10, 15);
    expect(nextAllowedTime(due, SYD).toISOString()).toBe(due.toISOString());
  });

  // The 3am problem this whole module exists to prevent.
  it('moves an overnight message to the same morning', () => {
    const due = syd(2026, 9, 8, 2, 30); // Tuesday 02:30
    expect(nextAllowedTime(due, SYD).toISOString()).toBe(syd(2026, 9, 8, 8).toISOString());
  });

  it('moves an evening message to the next morning', () => {
    const due = syd(2026, 9, 8, 21); // Tuesday 21:00
    expect(nextAllowedTime(due, SYD).toISOString()).toBe(syd(2026, 9, 9, 8).toISOString());
  });

  it('carries a Friday night message to Monday morning', () => {
    const due = syd(2026, 9, 11, 20); // Friday 20:00
    expect(nextAllowedTime(due, SYD).toISOString()).toBe(syd(2026, 9, 14, 8).toISOString());
  });

  it('carries a Saturday message to Monday morning', () => {
    const due = syd(2026, 9, 12, 10); // Saturday
    expect(nextAllowedTime(due, SYD).toISOString()).toBe(syd(2026, 9, 14, 8).toISOString());
  });

  it('carries a Sunday message to Monday morning', () => {
    const due = syd(2026, 9, 13, 10);
    expect(nextAllowedTime(due, SYD).toISOString()).toBe(syd(2026, 9, 14, 8).toISOString());
  });

  it('keeps a weekend send when the office sends every day', () => {
    const everyDay = { ...SYD, businessDaysOnly: false };
    const due = syd(2026, 9, 12, 10);
    expect(nextAllowedTime(due, everyDay).toISOString()).toBe(due.toISOString());
  });

  it('never returns a time before the one requested', () => {
    for (const hour of [0, 3, 7, 8, 12, 18, 19, 23]) {
      const due = syd(2026, 9, 10, hour);
      expect(nextAllowedTime(due, SYD).getTime()).toBeGreaterThanOrEqual(due.getTime());
    }
  });

  it('always returns a time that is itself sendable', () => {
    for (const day of [8, 9, 10, 11, 12, 13, 14]) {
      for (const hour of [1, 6, 8, 13, 19, 23]) {
        const result = nextAllowedTime(syd(2026, 9, day, hour), SYD);
        expect(isWithinWindow(result, SYD), `${day}/9 ${hour}:00 → ${result.toISOString()}`).toBe(true);
      }
    }
  });

  it('resolves in the office own zone, not the server zone', () => {
    // 22:00 Tuesday in Perth is 00:00 Wednesday in Sydney. Perth waits for
    // Wednesday morning in Perth.
    const due = zonedTimeToInstant('Australia/Perth', 2026, 9, 8, 22);
    const moved = nextAllowedTime(due, PER);
    const p = localParts(moved, 'Australia/Perth');
    expect([p.day, p.hour]).toEqual([9, 8]);
  });

  it('handles a message due during the daylight-saving changeover weekend', () => {
    // Saturday 4 April 2026, the night before DST ends.
    const due = syd(2026, 4, 4, 23);
    const moved = nextAllowedTime(due, SYD);
    const p = localParts(moved, 'Australia/Sydney');
    expect([p.month, p.day, p.hour]).toEqual([4, 6, 8]); // Monday 6 April, 08:00
    expect(isWithinWindow(moved, SYD)).toBe(true);
  });
});

describe('retryDelayMs', () => {
  it('waits at least a minute before the first retry', () => {
    expect(retryDelayMs(1)).toBeGreaterThanOrEqual(60_000);
  });

  it('backs off as attempts mount', () => {
    expect(retryDelayMs(3)).toBeGreaterThan(retryDelayMs(2));
  });

  it('caps the wait at two hours', () => {
    expect(retryDelayMs(99)).toBe(120 * 60_000);
  });
});
