import { greetingFor, longDate } from './today';

describe('greetingFor', () => {
  it.each([
    ['2026-11-13T23:30:00Z', 'Good morning'], // 05:30 Dhaka
    ['2026-11-13T05:59:00Z', 'Good morning'], // 11:59
    ['2026-11-13T06:00:00Z', 'Good afternoon'], // 12:00
    ['2026-11-13T11:00:00Z', 'Good evening'], // 17:00
    ['2026-11-13T17:00:00Z', 'Good evening'], // 23:00
    ['2026-11-13T19:00:00Z', 'Still up'], // 01:00
  ])('%s -> %s', (iso, expected) => {
    expect(greetingFor(new Date(iso), 'Asia/Dhaka')).toBe(expected);
  });
});

describe('longDate', () => {
  it('uses the settings time zone, not the device one', () => {
    // 20:00 UTC on Friday is already Saturday in Dhaka.
    expect(longDate(new Date('2026-11-13T20:00:00Z'), 'Asia/Dhaka')).toBe('Saturday, 14 November');
    expect(longDate(new Date('2026-11-13T20:00:00Z'), 'UTC')).toBe('Friday, 13 November');
  });
});
