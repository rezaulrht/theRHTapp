import { fromPoints, pointsText, toPoints, type DayItem } from './habits';
import {
  dayResultText,
  dayScoreText,
  habitToday,
  instantOn,
  missRateText,
  nextText,
  outcomeText,
  streakText,
  timeInputValue,
  timeText,
  windowText,
} from './habits-text';

const zone = 'Asia/Dhaka';
const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);
const item = (over: Partial<DayItem>): DayItem => ({
  itemId: 'i',
  name: 'Breakfast',
  points: 500,
  timing: { kind: 'fixed', due: '08:30' },
  opensAt: null,
  dueAt: dhaka('2026-11-15', '08:30').toISOString(),
  outcome: 'pending',
  score: 0,
  skipped: false,
  marks: [],
  target: null,
  ...over,
});

describe('points', () => {
  it('reads what is typed into hundredths', () => {
    expect(toPoints('5')).toEqual({ ok: true, points: 500 });
    expect(toPoints('2.5')).toEqual({ ok: true, points: 250 });
    expect(toPoints(' 7.25 ')).toEqual({ ok: true, points: 725 });
    expect(toPoints('.5')).toEqual({ ok: true, points: 50 });
  });

  it.each(['', 'abc', '-5', '0', '1.234', '.', '99999'])('refuses "%s"', (text) => {
    expect(toPoints(text).ok).toBe(false);
  });

  it('writes them the way they are read', () => {
    expect(fromPoints(250)).toBe(2.5);
    expect(pointsText(500)).toBe('5');
    expect(pointsText(250)).toBe('2.5');
    expect(pointsText(-750)).toBe('−7.5');
    expect(pointsText(500, true)).toBe('+5');
    expect(pointsText(0, true)).toBe('0');
    expect(pointsText(4250)).toBe('42.5');
  });
});

describe('the habit clock', () => {
  it('is still yesterday before the day-end hour', () => {
    expect(habitToday(zone, 4, dhaka('2026-11-16', '03:59'))).toBe('2026-11-15');
    expect(habitToday(zone, 4, dhaka('2026-11-16', '04:00'))).toBe('2026-11-16');
  });

  it('turns a time on a habit day into an instant', () => {
    expect(instantOn('2026-11-15', '08:25', zone, 4)).toEqual(dhaka('2026-11-15', '08:25'));
    // One in the morning belongs to the night before.
    expect(instantOn('2026-11-15', '01:00', zone, 4)).toEqual(dhaka('2026-11-16', '01:00'));
    expect(instantOn('2026-03-29', '09:00', 'Europe/London', 4)).toEqual(new Date('2026-03-29T08:00:00Z'));
  });

  it('shows an instant as a time', () => {
    expect(timeText(dhaka('2026-11-15', '08:30').toISOString(), zone)).toBe('8:30 am');
    expect(timeText(dhaka('2026-11-15', '13:05').toISOString(), zone)).toBe('1:05 pm');
    expect(timeInputValue(dhaka('2026-11-15', '08:05').toISOString(), zone)).toBe('08:05');
  });
});

describe('windowText', () => {
  it('a due time', () => {
    expect(windowText(item({}), zone)).toBe('By 8:30 am');
  });

  it('a window, naming the half of the day once when both share it', () => {
    expect(
      windowText(
        item({
          timing: { kind: 'fixed', start: '13:00', due: '13:30' },
          opensAt: dhaka('2026-11-15', '13:00').toISOString(),
          dueAt: dhaka('2026-11-15', '13:30').toISOString(),
        }),
        zone,
      ),
    ).toBe('1:00 to 1:30 pm');
    expect(
      windowText(
        item({
          timing: { kind: 'prayer', prayer: 'zuhr' },
          opensAt: dhaka('2026-11-15', '11:45').toISOString(),
          dueAt: dhaka('2026-11-15', '15:35').toISOString(),
        }),
        zone,
      ),
    ).toBe('11:45 am to 3:35 pm');
  });

  it('no deadline', () => {
    expect(windowText(item({ timing: { kind: 'fixed' } }), zone)).toBe('Any time today');
    expect(
      windowText(
        item({ timing: { kind: 'prayer', prayer: 'isha' }, opensAt: dhaka('2026-11-15', '18:35').toISOString() }),
        zone,
      ),
    ).toBe('From 6:35 pm');
  });

  it('a count for a repeating item', () => {
    const marks = [1, 2, 3].map((n) => ({ id: String(n), at: dhaka('2026-11-15', `1${n}:00`).toISOString() }));
    expect(
      windowText(
        item({ timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 }, target: 8, marks }),
        zone,
      ),
    ).toBe('3 of 8');
  });
});

describe('results', () => {
  it('names each outcome', () => {
    expect(outcomeText('onTime')).toBe('On time');
    expect(outcomeText('late')).toBe('Late');
    expect(outcomeText('missed')).toBe('Missed');
    expect(outcomeText('skipped')).toBe('Skipped');
    expect(outcomeText('pending')).toBe('');
  });

  it('says where the day stands', () => {
    const base = { closed: false, score: 1000, target: 1750, skipped: false };
    expect(dayResultText({ ...base, won: false })).toBe('7.5 to go to win the day');
    expect(dayResultText({ ...base, won: true, score: 2000 })).toBe('Day won');
    expect(dayResultText({ ...base, won: false, closed: true })).toBe('Day lost');
    expect(dayResultText({ ...base, won: null })).toBe('');
    expect(dayResultText({ ...base, won: null, skipped: true })).toBe('Day skipped');
  });

  it('says what is next', () => {
    expect(nextText({ itemId: 'i', name: 'Breakfast', at: dhaka('2026-11-15', '08:30').toISOString() }, zone)).toBe(
      'Next: Breakfast at 8:30 am',
    );
    expect(nextText({ itemId: 'i', name: 'Brush teeth', at: null }, zone)).toBe('Next: Brush teeth');
    expect(nextText(null, zone)).toBe('');
  });

  it('reads a day’s bar aloud', () => {
    const day = { day: '2026-11-15', score: 4250, possible: 6000, won: true as boolean | null, skipped: false };
    expect(dayScoreText(day)).toBe('Sunday 15 November: 42.5 of 60, won');
    expect(dayScoreText({ ...day, won: false, score: -500 })).toBe('Sunday 15 November: −5 of 60, lost');
    expect(dayScoreText({ ...day, skipped: true })).toBe('Sunday 15 November: skipped');
  });

  it('words streaks and miss rates', () => {
    expect(streakText(6, 14)).toBe('6 days, best 14');
    expect(streakText(1, 1)).toBe('1 day, best 1');
    expect(streakText(0, 0)).toBe('No streak yet');
    expect(streakText(0, 3)).toBe('0 days, best 3');
    expect(missRateText(4, 12)).toBe('Missed 4 of 12 days');
    expect(missRateText(0, 5)).toBe('Never missed in 5 days');
    expect(missRateText(0, 0)).toBe('Not counted yet');
  });
});
