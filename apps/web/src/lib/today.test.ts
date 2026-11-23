import { clockParts, longDate } from './today';

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

describe('longDate', () => {
  it('uses the settings time zone, not the device one', () => {
    // 20:00 UTC on Friday is already Saturday in Dhaka.
    expect(longDate(new Date('2026-11-13T20:00:00Z'), 'Asia/Dhaka')).toBe('Saturday, 14 November');
    expect(longDate(new Date('2026-11-13T20:00:00Z'), 'UTC')).toBe('Friday, 13 November');
  });
});
