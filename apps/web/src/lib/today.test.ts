import { clockParts, longDate, prayerStanding, untilText } from './today';

describe('clockParts', () => {
  it.each([
    ['2026-11-13T23:30:05Z', { hours: '05', minutes: '30', seconds: '05', period: 'am' }], // 05:30:05 Dhaka
    ['2026-11-13T11:09:59Z', { hours: '05', minutes: '09', seconds: '59', period: 'pm' }], // 17:09:59
    ['2026-11-13T06:00:00Z', { hours: '12', minutes: '00', seconds: '00', period: 'pm' }], // noon
    ['2026-11-13T18:00:00Z', { hours: '12', minutes: '00', seconds: '00', period: 'am' }], // midnight
    ['2026-11-13T17:59:59Z', { hours: '11', minutes: '59', seconds: '59', period: 'pm' }], // 23:59:59
  ])('%s in Dhaka', (iso, expected) => {
    expect(clockParts(new Date(iso), 'Asia/Dhaka')).toEqual(expected);
  });

  it('uses the settings time zone, not the device one', () => {
    const at = new Date('2026-11-13T20:15:30Z');
    expect(clockParts(at, 'Asia/Dhaka')).toEqual({ hours: '02', minutes: '15', seconds: '30', period: 'am' });
    expect(clockParts(at, 'UTC')).toEqual({ hours: '08', minutes: '15', seconds: '30', period: 'pm' });
  });
});

describe('prayerStanding', () => {
  const times = {
    fajr: '2026-11-13T23:30:00Z',
    zuhr: '2026-11-13T06:00:00Z',
    asr: '2026-11-13T09:30:00Z',
    maghrib: '2026-11-13T11:15:00Z',
    isha: '2026-11-13T12:30:00Z',
  };

  it('is between Zuhr and Asr at midday', () => {
    const standing = prayerStanding(times, new Date('2026-11-13T07:00:00Z'));
    expect(standing).toEqual({ current: 'zuhr', next: 'asr', untilNextMs: 2.5 * 3_600_000 });
  });

  it('has no current prayer before the first one, and waits for it', () => {
    const standing = prayerStanding({ ...times, fajr: '2026-11-13T22:00:00Z' }, new Date('2026-11-13T00:00:00Z'));
    expect(standing.current).toBeNull();
    expect(standing.next).toBe('fajr');
  });

  it('counts down to tomorrow’s Fajr after Isha when it is known, and has no countdown when it is not', () => {
    const late = new Date('2026-11-13T13:00:00Z');
    // Tomorrow's Fajr, 04:00 in Dhaka on the 14th, is 9 hours after 13:00 UTC on the 13th.
    expect(prayerStanding(times, late, '2026-11-13T22:00:00Z')).toEqual({
      current: 'isha',
      next: 'tomorrow-fajr',
      untilNextMs: 9 * 3_600_000,
    });
    expect(prayerStanding(times, late)).toEqual({ current: 'isha', next: null, untilNextMs: null });
  });

  it('treats the exact start as already begun', () => {
    expect(prayerStanding(times, new Date(times.asr)).current).toBe('asr');
  });
});

describe('untilText', () => {
  it.each([
    [30_000, 'under a minute'],
    [12 * 60_000, '12 min'],
    [65 * 60_000, '1 h 05 min'],
    [120 * 60_000, '2 h 00 min'],
  ])('%i ms is %s', (ms, expected) => {
    expect(untilText(ms)).toBe(expected);
  });
});

describe('longDate', () => {
  it('uses the settings time zone, not the device one', () => {
    // 20:00 UTC on Friday is already Saturday in Dhaka.
    expect(longDate(new Date('2026-11-13T20:00:00Z'), 'Asia/Dhaka')).toBe('Saturday, 14 November');
    expect(longDate(new Date('2026-11-13T20:00:00Z'), 'UTC')).toBe('Friday, 13 November');
  });
});
