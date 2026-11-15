import { DateTime } from 'luxon';
import { WEEK_DAYS, type Settings } from './settings';

// Pure habit maths. Points are whole hundredths of a point: a 5-point item is 500.
// A habit day is named by the calendar date it starts on and runs from the
// day-end hour on that date to the same hour on the next.

export const PRAYERS = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'] as const;
export type Prayer = (typeof PRAYERS)[number];

export type Timing =
  /** An optional start and an optional due time, 'HH:mm'. No due time means any time that day. */
  | { kind: 'fixed'; start?: string; due?: string }
  /** From that prayer's start to the next prayer's start, or a narrower window inside it. */
  | { kind: 'prayer'; prayer: Prayer; start?: string; end?: string }
  /** Nudged every `everyMinutes` from `start` to `end`, to be done `target` times. */
  | { kind: 'repeating'; start: string; end: string; everyMinutes: number; target: number };

export type AppliesTo = { kind: 'weekdays'; days: number[] } | { kind: 'dayTypes'; dayTypeIds: string[] };

export interface PrayerTimes {
  fajr: Date;
  sunrise: Date;
  zuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

export interface DayContext {
  timeZone: string;
  dayEndHour: number;
  prayers: PrayerTimes;
}

export interface ItemWindow {
  opensAt: Date | null;
  dueAt: Date;
}

export const OUTCOMES = ['onTime', 'late', 'missed', 'pending', 'skipped'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface ScoreRules {
  points: number;
  lateShare: number;
  missMultiplier: number;
}

function parseTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return { hour, minute };
}

/** The habit day an instant belongs to: before the day-end hour it is still the day before. */
export function habitDayOf(instant: Date, timeZone: string, dayEndHour: number): string {
  return DateTime.fromJSDate(instant, { zone: timeZone }).minus({ hours: dayEndHour }).toFormat('yyyy-MM-dd');
}

export function habitDayBounds(day: string, timeZone: string, dayEndHour: number): { start: Date; end: Date } {
  const start = DateTime.fromISO(day, { zone: timeZone }).set({ hour: dayEndHour });
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

/**
 * A time of day on a habit day, as an instant. A time earlier than the day-end
 * hour (01:00 with a 4 o'clock day end) falls on the next calendar date.
 */
export function resolveTime(day: string, time: string, timeZone: string, dayEndHour: number): Date {
  const parts = parseTime(time);
  const date = DateTime.fromISO(day, { zone: timeZone });
  const afterMidnight = parts.hour < dayEndHour;
  return (afterMidnight ? date.plus({ days: 1 }) : date).set(parts).toJSDate();
}

/** Whether an item is on the routine for a habit day. */
export function appliesOn(appliesTo: AppliesTo, day: string, weekPattern: Settings['general.weekPattern']): boolean {
  // Luxon counts Monday = 1 … Sunday = 7; we use Sunday = 0 … Saturday = 6.
  const weekday = DateTime.fromISO(day, { zone: 'utc' }).weekday % 7;
  if (appliesTo.kind === 'weekdays') return appliesTo.days.includes(weekday);
  return appliesTo.dayTypeIds.includes(weekPattern[WEEK_DAYS[weekday]!]);
}

/** When an item opens and when it is due on a habit day. */
export function windowFor(timing: Timing, day: string, context: DayContext): ItemWindow {
  const at = (time: string) => resolveTime(day, time, context.timeZone, context.dayEndHour);
  const dayEnd = habitDayBounds(day, context.timeZone, context.dayEndHour).end;

  if (timing.kind === 'fixed') {
    return { opensAt: timing.start ? at(timing.start) : null, dueAt: timing.due ? at(timing.due) : dayEnd };
  }
  if (timing.kind === 'repeating') {
    return { opensAt: at(timing.start), dueAt: at(timing.end) };
  }
  const { prayers } = context;
  const natural: Record<Prayer, [Date, Date]> = {
    fajr: [prayers.fajr, prayers.sunrise],
    zuhr: [prayers.zuhr, prayers.asr],
    asr: [prayers.asr, prayers.maghrib],
    maghrib: [prayers.maghrib, prayers.isha],
    isha: [prayers.isha, dayEnd],
  };
  const [opens, due] = natural[timing.prayer];
  return { opensAt: timing.start ? at(timing.start) : opens, dueAt: timing.end ? at(timing.end) : due };
}

/** How an item stands, from its window and the taps recorded for it. */
export function outcomeFor(input: {
  timing: Timing;
  window: ItemWindow;
  marks: Date[];
  skipped: boolean;
  now: Date;
  dayEnd: Date;
}): Outcome {
  const { timing, window, marks, skipped, now, dayEnd } = input;
  if (skipped) return 'skipped';
  const ended = now.getTime() >= dayEnd.getTime();

  if (timing.kind === 'repeating') {
    if (marks.length >= timing.target) return 'onTime';
    if (!ended) return 'pending';
    return marks.length >= Math.ceil(timing.target / 2) ? 'late' : 'missed';
  }

  if (marks.length === 0) return ended ? 'missed' : 'pending';
  const earliest = Math.min(...marks.map((mark) => mark.getTime()));
  // Done early is done on time.
  return earliest <= window.dueAt.getTime() ? 'onTime' : 'late';
}

export function scoreFor(rules: ScoreRules, outcome: Outcome): number {
  switch (outcome) {
    case 'onTime':
      return rules.points;
    case 'late':
      return Math.round(rules.points * rules.lateShare);
    case 'missed': {
      const cost = Math.round(rules.points * rules.missMultiplier);
      return cost === 0 ? 0 : -cost;
    }
    default:
      return 0;
  }
}

export interface DaySummary {
  score: number;
  /** The most the day could score: every unskipped item on time. */
  possible: number;
  /** Points given up so far by items already late or missed. */
  lost: number;
  target: number;
  /** Null when nothing was possible, so the day is neither won nor lost. */
  won: boolean | null;
}

export function summariseDay(items: { rules: ScoreRules; outcome: Outcome }[], targetPercent: number): DaySummary {
  let score = 0;
  let possible = 0;
  let lost = 0;
  for (const item of items) {
    if (item.outcome === 'skipped') continue;
    const earned = scoreFor(item.rules, item.outcome);
    score += earned;
    possible += item.rules.points;
    if (item.outcome !== 'pending') lost += item.rules.points - earned;
  }
  const target = Math.round((possible * targetPercent) / 100);
  return { score, possible, lost, target, won: possible === 0 ? null : score >= target };
}

/**
 * Runs of consecutive done days, oldest day first. A skipped day neither adds
 * to a run nor breaks it; a missed day ends it.
 */
export function streak(days: ('done' | 'missed' | 'skipped')[]): { current: number; best: number } {
  let run = 0;
  let best = 0;
  for (const day of days) {
    if (day === 'skipped') continue;
    run = day === 'done' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

/** Every instant a repeating item nudges on a habit day, first to last. */
export function nudgeTimes(
  timing: Extract<Timing, { kind: 'repeating' }>,
  day: string,
  context: DayContext,
): Date[] {
  const start = resolveTime(day, timing.start, context.timeZone, context.dayEndHour).getTime();
  const end = resolveTime(day, timing.end, context.timeZone, context.dayEndHour).getTime();
  const step = Math.max(timing.everyMinutes, 1) * 60_000;
  const times: Date[] = [];
  for (let at = start; at <= end; at += step) times.push(new Date(at));
  return times;
}
