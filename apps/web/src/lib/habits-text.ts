import { pointsText, type DayItem, type DayReport, type Outcome } from './habits';
import { addDays, todayInZone } from './money-text';

// All of Habits' wording and its few bits of clock arithmetic.

/** The habit day it is now: before the day-end hour it is still the day before. */
export function habitToday(timeZone: string, dayEndHour: number, now: Date = new Date()): string {
  return todayInZone(timeZone, new Date(now.getTime() - dayEndHour * 3_600_000));
}

/** Minutes a zone is ahead of UTC at an instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * A time of day on a habit day, as an instant. A time earlier than the
 * day-end hour (01:00) is on the next calendar date.
 */
export function instantOn(day: string, time: string, timeZone: string, dayEndHour: number): Date {
  const hour = Number(time.split(':')[0] ?? 0);
  const date = hour < dayEndHour ? addDays(day, 1) : day;
  const wall = new Date(`${date}T${time}:00Z`).getTime();
  // Two passes settle the offset on either side of a daylight-saving change.
  let instant = new Date(wall - offsetMinutes(new Date(wall), timeZone) * 60_000);
  instant = new Date(wall - offsetMinutes(instant, timeZone) * 60_000);
  return instant;
}

/** "08:30" for an instant, for a time input. */
export function timeInputValue(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );
}

function clock(iso: string, timeZone: string): { time: string; half: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(
    new Date(iso),
  );
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { time: `${get('hour')}:${get('minute')}`, half: get('dayPeriod').toLowerCase() };
}

/** "8:30 am" */
export function timeText(iso: string, timeZone: string): string {
  const { time, half } = clock(iso, timeZone);
  return `${time} ${half}`;
}

function hasDeadline(item: DayItem): boolean {
  if (item.timing.kind === 'fixed') return item.timing.due !== undefined;
  if (item.timing.kind === 'prayer') return item.timing.prayer !== 'isha' || item.timing.end !== undefined;
  return true;
}

/** When an item is to be done: "By 8:30 am", "1:00 to 1:30 pm", "Any time today", "3 of 8". */
export function windowText(item: DayItem, timeZone: string): string {
  if (item.target !== null) return `${item.marks.length} of ${item.target}`;
  if (!hasDeadline(item)) {
    return item.opensAt ? `From ${timeText(item.opensAt, timeZone)}` : 'Any time today';
  }
  if (!item.opensAt) return `By ${timeText(item.dueAt, timeZone)}`;
  const from = clock(item.opensAt, timeZone);
  const to = clock(item.dueAt, timeZone);
  return from.half === to.half ? `${from.time} to ${to.time} ${to.half}` : `${from.time} ${from.half} to ${to.time} ${to.half}`;
}

export function outcomeText(outcome: Outcome): string {
  switch (outcome) {
    case 'onTime':
      return 'On time';
    case 'late':
      return 'Late';
    case 'missed':
      return 'Missed';
    case 'skipped':
      return 'Skipped';
    default:
      return '';
  }
}

/** Where the day stands against its target. Empty when nothing counted. */
export function dayResultText(report: Pick<DayReport, 'won' | 'closed' | 'score' | 'target' | 'skipped'>): string {
  if (report.skipped) return 'Day skipped';
  if (report.won === null) return '';
  if (report.won) return 'Day won';
  return report.closed ? 'Day lost' : `${pointsText(report.target - report.score)} to go to win the day`;
}

/** "Next: Breakfast at 8:30 am" */
export function nextText(next: DayReport['next'], timeZone: string): string {
  if (!next) return '';
  return next.at ? `Next: ${next.name} at ${timeText(next.at, timeZone)}` : `Next: ${next.name}`;
}

/** "Sunday 15 November: 42.5 of 60, won" — a day's bar, read aloud. */
export function dayScoreText(day: { day: string; score: number; possible: number; won: boolean | null; skipped: boolean }): string {
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day.day}T00:00:00Z`))
    .replace(',', '');
  if (day.skipped) return `${date}: skipped`;
  const result = day.won === null ? '' : day.won ? ', won' : ', lost';
  return `${date}: ${pointsText(day.score)} of ${pointsText(day.possible)}${result}`;
}

/** "6 days, best 14" */
export function streakText(current: number, best: number): string {
  if (best === 0) return 'No streak yet';
  const days = (count: number) => `${count} ${count === 1 ? 'day' : 'days'}`;
  return `${days(current)}, best ${best}`;
}

/** "Missed 4 of 12 days" */
export function missRateText(missed: number, applied: number): string {
  if (applied === 0) return 'Not counted yet';
  if (missed === 0) return `Never missed in ${applied} ${applied === 1 ? 'day' : 'days'}`;
  return `Missed ${missed} of ${applied} ${applied === 1 ? 'day' : 'days'}`;
}
