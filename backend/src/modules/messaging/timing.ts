// When a message is actually allowed to go out.
//
// Pure functions, no database and no clock of their own — every entry point
// takes the instant it is reasoning about. That keeps this testable, which
// matters more here than anywhere else in the engine: getting it wrong means
// texting a customer at 3am.
//
// Timezones come from the office record (offices.timezone, e.g.
// "Australia/Sydney"), so a Perth office and a Sydney office each send in their
// own morning, and daylight saving is handled by the platform rather than by us
// adding hours.

export interface SendingWindow {
  /** No sends at or after this local hour. 19 → nothing from 19:00. */
  quietStartHour: number;
  /** Sending resumes at this local hour. 8 → first send at 08:00. */
  quietEndHour: number;
  /** Skip Saturday and Sunday entirely. */
  businessDaysOnly: boolean;
  /** IANA zone, e.g. "Australia/Sydney". */
  timezone: string;
}

export const DEFAULT_WINDOW: SendingWindow = {
  quietStartHour: 19,
  quietEndHour: 8,
  businessDaysOnly: true,
  timezone: 'Australia/Sydney',
};

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timezone, f);
  }
  return f;
}

/** Wall-clock reading of an instant in a given zone. */
export function localParts(instant: Date, timezone: string): LocalParts {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  // Intl renders midnight as hour 24 in some engines; normalise it to 0.
  const hour = Number(get('hour')) % 24;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

/** Offset of a zone from UTC at a given instant, in milliseconds. */
function offsetMs(instant: Date, timezone: string): number {
  const p = localParts(instant, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, instant.getUTCSeconds());
  // Ignore sub-second drift; we only ever schedule to the minute.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a given wall-clock time occurs in a zone.
 *
 * Two passes: the first guess uses the offset at the naive UTC instant, the
 * second re-reads the offset at that corrected instant. That second pass is
 * what keeps the daylight-saving changeover from landing an hour out.
 */
export function zonedTimeToInstant(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(naive - offsetMs(new Date(naive), timezone));
  instant = new Date(naive - offsetMs(instant, timezone));
  return instant;
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

/** Is this instant inside the allowed sending window? */
export function isWithinWindow(instant: Date, window: SendingWindow): boolean {
  const p = localParts(instant, window.timezone);
  if (window.businessDaysOnly && isWeekend(p.weekday)) return false;
  return p.hour >= window.quietEndHour && p.hour < window.quietStartHour;
}

/**
 * The first moment at or after `desired` when sending is allowed.
 *
 * A message due at 2am is moved to the same morning, not dropped and not sent
 * at 2am. A message due Friday evening waits for Monday morning when
 * businessDaysOnly is on.
 */
export function nextAllowedTime(desired: Date, window: SendingWindow): Date {
  if (isWithinWindow(desired, window)) return desired;

  let candidate = desired;
  // Each pass moves to the next plausible opening; a fortnight of passes is far
  // more than any real window needs, and stops a bad config spinning forever.
  for (let i = 0; i < 20; i += 1) {
    const p = localParts(candidate, window.timezone);

    if (window.businessDaysOnly && isWeekend(p.weekday)) {
      const daysToMonday = p.weekday === 6 ? 2 : 1;
      candidate = zonedTimeToInstant(
        window.timezone,
        p.year,
        p.month,
        p.day + daysToMonday,
        window.quietEndHour,
      );
    } else if (p.hour < window.quietEndHour) {
      // Too early — wait for this morning's opening.
      candidate = zonedTimeToInstant(window.timezone, p.year, p.month, p.day, window.quietEndHour);
    } else {
      // At or past the evening cutoff — next day's opening.
      candidate = zonedTimeToInstant(window.timezone, p.year, p.month, p.day + 1, window.quietEndHour);
    }

    if (isWithinWindow(candidate, window)) return candidate;
  }
  // Unreachable with a sane window; returning the desired time is safer than
  // looping, and the queue screen will show it as due.
  return desired;
}

/** Exponential backoff for a failed send: 1, 5, 25 minutes, capped at 2 hours. */
export function retryDelayMs(attempts: number): number {
  const minutes = Math.min(120, 5 ** Math.max(0, attempts - 1) / 5);
  return Math.max(60_000, minutes * 60_000);
}
