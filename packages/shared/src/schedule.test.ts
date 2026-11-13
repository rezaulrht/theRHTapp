import { describe, expect, it } from 'vitest';
import { scheduleSchema } from './reminder';
import { isInQuietHours, nextOccurrence } from './schedule';

// Dhaka is UTC+6 all year. 2026-11-13 is a Friday.
const tz = 'Asia/Dhaka';
const d = (iso: string) => new Date(iso);

describe('nextOccurrence', () => {
  it('once: returns the instant if still ahead, else null', () => {
    const s = { kind: 'once', at: '2026-11-13T04:00:00Z' } as const;
    expect(nextOccurrence(s, d('2026-11-13T03:59:00Z'), tz)).toEqual(d('2026-11-13T04:00:00Z'));
    expect(nextOccurrence(s, d('2026-11-13T04:00:00Z'), tz)).toBeNull();
  });

  it('weekly: 05:30 Dhaka on Sat-Thu skips Friday', () => {
    const s = { kind: 'weekly', days: [0, 1, 2, 3, 4, 6], time: '05:30' } as const;
    // Thursday 12 Nov 06:00 Dhaka -> Saturday 14 Nov 05:30 Dhaka = Fri 23:30Z
    expect(nextOccurrence(s, d('2026-11-12T00:00:00Z'), tz)).toEqual(d('2026-11-13T23:30:00Z'));
  });

  it('weekly: is strictly after the given instant', () => {
    const s = { kind: 'weekly', days: [5], time: '08:30' } as const;
    expect(nextOccurrence(s, d('2026-11-13T02:30:00Z'), tz)).toEqual(d('2026-11-20T02:30:00Z'));
  });

  it('weekly: negative offset fires before the time', () => {
    const s = { kind: 'weekly', days: [5], time: '08:30', offsetMinutes: -10 } as const;
    expect(nextOccurrence(s, d('2026-11-12T12:00:00Z'), tz)).toEqual(d('2026-11-13T02:20:00Z'));
  });

  it('interval: steps inside the window then rolls to the next allowed day', () => {
    const s = { kind: 'interval', days: [5], start: '09:00', end: '12:00', everyMinutes: 90 } as const;
    expect(nextOccurrence(s, d('2026-11-13T03:00:00Z'), tz)).toEqual(d('2026-11-13T04:30:00Z')); // 10:30
    expect(nextOccurrence(s, d('2026-11-13T04:30:00Z'), tz)).toEqual(d('2026-11-13T06:00:00Z')); // 12:00
    expect(nextOccurrence(s, d('2026-11-13T06:00:00Z'), tz)).toEqual(d('2026-11-20T03:00:00Z')); // next Fri 09:00
  });

  it('interval: before the window opens, returns the window start', () => {
    const s = { kind: 'interval', days: [5], start: '09:00', end: '12:00', everyMinutes: 90 } as const;
    expect(nextOccurrence(s, d('2026-11-13T00:00:00Z'), tz)).toEqual(d('2026-11-13T03:00:00Z'));
  });

  it('weekly: keeps the wall-clock time across a daylight-saving change', () => {
    // New York leaves daylight saving on Sunday 1 Nov 2026.
    const s = { kind: 'weekly', days: [0, 6], time: '08:00' } as const;
    const ny = 'America/New_York';
    expect(nextOccurrence(s, d('2026-10-31T11:00:00Z'), ny)).toEqual(d('2026-10-31T12:00:00Z')); // Sat 08:00 EDT
    expect(nextOccurrence(s, d('2026-10-31T12:00:00Z'), ny)).toEqual(d('2026-11-01T13:00:00Z')); // Sun 08:00 EST
  });
});

describe('isInQuietHours', () => {
  const q = { enabled: true, start: '23:30', end: '05:00' };

  it('handles a range that crosses midnight', () => {
    expect(isInQuietHours(d('2026-11-13T18:00:00Z'), q, tz)).toBe(true); // 00:00 Dhaka
    expect(isInQuietHours(d('2026-11-13T17:30:00Z'), q, tz)).toBe(true); // 23:30 Dhaka, start is inclusive
    expect(isInQuietHours(d('2026-11-12T23:00:00Z'), q, tz)).toBe(false); // 05:00 Dhaka, end is exclusive
    expect(isInQuietHours(d('2026-11-13T06:00:00Z'), q, tz)).toBe(false); // noon
  });

  it('handles a same-day range', () => {
    const day = { enabled: true, start: '13:00', end: '14:00' };
    expect(isInQuietHours(d('2026-11-13T07:30:00Z'), day, tz)).toBe(true); // 13:30
    expect(isInQuietHours(d('2026-11-13T08:00:00Z'), day, tz)).toBe(false); // 14:00
  });

  it('is never quiet when disabled', () => {
    expect(isInQuietHours(d('2026-11-13T18:00:00Z'), { ...q, enabled: false }, tz)).toBe(false);
  });
});

describe('scheduleSchema', () => {
  it.each([
    ['empty days', { kind: 'weekly', days: [], time: '05:30' }],
    ['a bad time', { kind: 'weekly', days: [1], time: '5:30' }],
    ['a day out of range', { kind: 'weekly', days: [7], time: '05:30' }],
    ['end before start', { kind: 'interval', days: [1], start: '12:00', end: '09:00', everyMinutes: 30 }],
    ['everyMinutes under 5', { kind: 'interval', days: [1], start: '09:00', end: '12:00', everyMinutes: 4 }],
    ['a once that is not an instant', { kind: 'once', at: 'tomorrow' }],
    ['an unknown kind', { kind: 'monthly', day: 1 }],
  ])('rejects %s', (_name, value) => {
    expect(scheduleSchema.safeParse(value).success).toBe(false);
  });

  it('accepts each valid kind', () => {
    expect(scheduleSchema.safeParse({ kind: 'once', at: '2026-11-13T04:00:00Z' }).success).toBe(true);
    expect(scheduleSchema.safeParse({ kind: 'weekly', days: [5], time: '08:30', offsetMinutes: -10 }).success).toBe(true);
    expect(
      scheduleSchema.safeParse({ kind: 'interval', days: [0, 6], start: '09:00', end: '21:00', everyMinutes: 90 }).success,
    ).toBe(true);
  });
});
