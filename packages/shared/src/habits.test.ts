import { describe, expect, it } from 'vitest';
import {
  appliesOn,
  habitDayBounds,
  habitDayOf,
  nudgeTimes,
  outcomeFor,
  resolveTime,
  scoreFor,
  streak,
  summariseDay,
  windowFor,
  type DayContext,
  type Outcome,
  type Timing,
} from './habits';
import { defaultSettings } from './settings';

const zone = 'Asia/Dhaka';
const day = '2026-11-15';
/** A Dhaka wall-clock time as an instant (Dhaka is UTC+6, no daylight saving). */
const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);

const context: DayContext = {
  timeZone: zone,
  dayEndHour: 4,
  prayers: {
    fajr: dhaka(day, '05:00'),
    sunrise: dhaka(day, '06:15'),
    zuhr: dhaka(day, '11:45'),
    asr: dhaka(day, '15:35'),
    maghrib: dhaka(day, '17:15'),
    isha: dhaka(day, '18:35'),
  },
};
const dayEnd = dhaka('2026-11-16', '04:00');
const rules = { points: 500, lateShare: 0.5, missMultiplier: 1.5 };

function outcome(timing: Timing, marks: Date[], now: Date, skipped = false): Outcome {
  return outcomeFor({ timing, window: windowFor(timing, day, context), marks, skipped, now, dayEnd });
}

describe('the habit day', () => {
  it('ends at the day-end hour, not midnight', () => {
    expect(habitDayOf(dhaka('2026-11-16', '03:59'), zone, 4)).toBe('2026-11-15');
    expect(habitDayOf(dhaka('2026-11-16', '04:00'), zone, 4)).toBe('2026-11-16');
    expect(habitDayOf(dhaka('2026-11-15', '23:50'), zone, 4)).toBe('2026-11-15');
    expect(habitDayOf(dhaka('2026-11-16', '00:30'), zone, 0)).toBe('2026-11-16');
  });

  it('runs from the day-end hour to the same hour the next date', () => {
    expect(habitDayBounds(day, zone, 4)).toEqual({ start: dhaka(day, '04:00'), end: dayEnd });
  });

  it('puts a time before the day-end hour on the next calendar date', () => {
    expect(resolveTime(day, '01:00', zone, 4)).toEqual(dhaka('2026-11-16', '01:00'));
    expect(resolveTime(day, '05:30', zone, 4)).toEqual(dhaka(day, '05:30'));
    expect(resolveTime(day, '04:00', zone, 4)).toEqual(dhaka(day, '04:00'));
  });
});

describe('appliesOn', () => {
  it('matches days of the week, Sunday being 0', () => {
    // 15 November 2026 is a Sunday.
    expect(appliesOn({ kind: 'weekdays', days: [0] }, day, defaultSettings['general.weekPattern'])).toBe(true);
    expect(appliesOn({ kind: 'weekdays', days: [1, 2] }, day, defaultSettings['general.weekPattern'])).toBe(false);
  });

  it('matches a day type from the week pattern', () => {
    const pattern = defaultSettings['general.weekPattern'];
    expect(appliesOn({ kind: 'dayTypes', dayTypeIds: ['workday'] }, day, pattern)).toBe(true);
    // 20 November 2026 is a Friday, a class day.
    expect(appliesOn({ kind: 'dayTypes', dayTypeIds: ['workday'] }, '2026-11-20', pattern)).toBe(false);
    expect(appliesOn({ kind: 'dayTypes', dayTypeIds: ['classday'] }, '2026-11-20', pattern)).toBe(true);
  });
});

describe('windowFor', () => {
  it('a fixed item opens at its start and is due at its due time', () => {
    expect(windowFor({ kind: 'fixed', start: '11:00', due: '11:30' }, day, context)).toEqual({
      opensAt: dhaka(day, '11:00'),
      dueAt: dhaka(day, '11:30'),
    });
    expect(windowFor({ kind: 'fixed', due: '08:30' }, day, context)).toEqual({
      opensAt: null,
      dueAt: dhaka(day, '08:30'),
    });
  });

  it('an item with no due time is due when the day ends', () => {
    expect(windowFor({ kind: 'fixed' }, day, context)).toEqual({ opensAt: null, dueAt: dayEnd });
  });

  it('a prayer runs to the next prayer, Fajr to sunrise and Isha to the end of the day', () => {
    expect(windowFor({ kind: 'prayer', prayer: 'fajr' }, day, context)).toEqual({
      opensAt: context.prayers.fajr,
      dueAt: context.prayers.sunrise,
    });
    expect(windowFor({ kind: 'prayer', prayer: 'asr' }, day, context)).toEqual({
      opensAt: context.prayers.asr,
      dueAt: context.prayers.maghrib,
    });
    expect(windowFor({ kind: 'prayer', prayer: 'isha' }, day, context)).toEqual({
      opensAt: context.prayers.isha,
      dueAt: dayEnd,
    });
  });

  it('a prayer window can be narrowed', () => {
    expect(windowFor({ kind: 'prayer', prayer: 'zuhr', start: '13:00', end: '13:30' }, day, context)).toEqual({
      opensAt: dhaka(day, '13:00'),
      dueAt: dhaka(day, '13:30'),
    });
    expect(windowFor({ kind: 'prayer', prayer: 'zuhr', end: '13:30' }, day, context).opensAt).toEqual(
      context.prayers.zuhr,
    );
  });
});

describe('outcomeFor', () => {
  const breakfast: Timing = { kind: 'fixed', due: '08:30' };

  it('is on time at or before the due time, and late after it', () => {
    expect(outcome(breakfast, [dhaka(day, '08:30')], dhaka(day, '09:00'))).toBe('onTime');
    expect(outcome(breakfast, [dhaka(day, '08:50')], dhaka(day, '09:00'))).toBe('late');
  });

  it('is pending until the day ends, then missed', () => {
    expect(outcome(breakfast, [], dhaka(day, '23:00'))).toBe('pending');
    expect(outcome(breakfast, [], dayEnd)).toBe('missed');
  });

  it('counts an item done before its window opens as on time', () => {
    const snack: Timing = { kind: 'fixed', start: '11:00', due: '11:30' };
    expect(outcome(snack, [dhaka(day, '10:40')], dhaka(day, '12:00'))).toBe('onTime');
  });

  it('an item with no due time is on time whenever it is done before the day ends', () => {
    expect(outcome({ kind: 'fixed' }, [dhaka('2026-11-16', '03:30')], dhaka('2026-11-16', '03:31'))).toBe('onTime');
  });

  it('going to bed at 1 a.m. is a late sleep on the same habit day', () => {
    const sleep: Timing = { kind: 'fixed', due: '23:30' };
    expect(outcome(sleep, [dhaka('2026-11-16', '01:00')], dhaka('2026-11-16', '01:01'))).toBe('late');
  });

  it('uses the earliest mark', () => {
    expect(outcome(breakfast, [dhaka(day, '09:10'), dhaka(day, '08:10')], dhaka(day, '10:00'))).toBe('onTime');
  });

  it('skipped wins over everything', () => {
    expect(outcome(breakfast, [dhaka(day, '08:00')], dayEnd, true)).toBe('skipped');
    expect(outcome(breakfast, [], dayEnd, true)).toBe('skipped');
  });

  describe('a repeating item', () => {
    const water: Timing = { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 };
    const taps = (count: number) => Array.from({ length: count }, (_, i) => dhaka(day, `${String(9 + i).padStart(2, '0')}:00`));

    it('is on time once the target is reached, and stays so past it', () => {
      expect(outcome(water, taps(8), dhaka(day, '20:00'))).toBe('onTime');
      expect(outcome(water, taps(9), dayEnd)).toBe('onTime');
    });

    it('is pending during the day', () => {
      expect(outcome(water, taps(5), dhaka(day, '15:00'))).toBe('pending');
    });

    it('at the end of the day, half the target is late and less is missed', () => {
      expect(outcome(water, taps(4), dayEnd)).toBe('late');
      expect(outcome(water, taps(3), dayEnd)).toBe('missed');
      expect(outcome({ ...water, target: 5 }, taps(3), dayEnd)).toBe('late');
      expect(outcome({ ...water, target: 5 }, taps(2), dayEnd)).toBe('missed');
    });
  });
});

describe('scoreFor', () => {
  it('gives full points on time, half late and one and a half times the points off for a miss', () => {
    expect(scoreFor(rules, 'onTime')).toBe(500);
    expect(scoreFor(rules, 'late')).toBe(250);
    expect(scoreFor(rules, 'missed')).toBe(-750);
    expect(scoreFor(rules, 'pending')).toBe(0);
    expect(scoreFor(rules, 'skipped')).toBe(0);
  });

  it('follows an item’s own late share and miss multiplier', () => {
    const own = { points: 500, lateShare: 0.8, missMultiplier: 1 };
    expect(scoreFor(own, 'late')).toBe(400);
    expect(scoreFor(own, 'missed')).toBe(-500);
  });

  it('never returns minus zero', () => {
    expect(Object.is(scoreFor({ points: 500, lateShare: 0.5, missMultiplier: 0 }, 'missed'), 0)).toBe(true);
  });
});

describe('summariseDay', () => {
  it('adds up a mixed day', () => {
    const summary = summariseDay(
      [
        { rules, outcome: 'onTime' },
        { rules, outcome: 'late' },
        { rules, outcome: 'missed' },
        { rules, outcome: 'skipped' },
      ],
      70,
    );
    // 500 + 250 − 750 = 0 of a possible 1500; 250 + 1250 given up.
    expect(summary).toEqual({ score: 0, possible: 1500, lost: 1500, target: 1050, won: false });
  });

  it('does not count pending items as lost', () => {
    const summary = summariseDay(
      [
        { rules, outcome: 'onTime' },
        { rules, outcome: 'pending' },
      ],
      50,
    );
    expect(summary).toEqual({ score: 500, possible: 1000, lost: 0, target: 500, won: true });
  });

  it('a day with nothing possible is neither won nor lost', () => {
    expect(summariseDay([{ rules, outcome: 'skipped' }], 70)).toEqual({
      score: 0,
      possible: 0,
      lost: 0,
      target: 0,
      won: null,
    });
    expect(summariseDay([], 70).won).toBeNull();
  });
});

describe('streak', () => {
  it('counts back from the newest day and remembers the best run', () => {
    expect(streak(['done', 'skipped', 'done', 'missed', 'done', 'done'])).toEqual({ current: 2, best: 2 });
    expect(streak(['done', 'done', 'done', 'missed', 'done'])).toEqual({ current: 1, best: 3 });
  });

  it('a skipped day does not break a run', () => {
    expect(streak(['done', 'done', 'skipped', 'done'])).toEqual({ current: 3, best: 3 });
    expect(streak(['done', 'skipped'])).toEqual({ current: 1, best: 1 });
  });

  it('a miss on the newest day resets it', () => {
    expect(streak(['done', 'done', 'missed'])).toEqual({ current: 0, best: 2 });
    expect(streak([])).toEqual({ current: 0, best: 0 });
  });
});

describe('nudgeTimes', () => {
  it('nudges every interval from start to end inclusive', () => {
    const times = nudgeTimes({ kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 }, day, context);
    expect(times).toHaveLength(9);
    expect(times[0]).toEqual(dhaka(day, '09:00'));
    expect(times[8]).toEqual(dhaka(day, '21:00'));
  });
});
