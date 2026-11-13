import { DateTime } from 'luxon';
import type { Schedule } from './reminder';
import type { Settings } from './settings';

function parseTime(time: string): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return { hour, minute };
}

/** Luxon counts Monday = 1 … Sunday = 7; schedules use Sunday = 0 … Saturday = 6. */
function dayIndex(date: DateTime): number {
  return date.weekday % 7;
}

/**
 * The first time `schedule` fires strictly after `after`, or `null` if it never
 * will. Times of day are read in `timeZone`. Candidates are built as wall-clock
 * times on each local date so the result stays right across daylight saving.
 */
export function nextOccurrence(schedule: Schedule, after: Date, timeZone: string): Date | null {
  if (schedule.kind === 'once') {
    const at = new Date(schedule.at);
    return at.getTime() > after.getTime() ? at : null;
  }

  const afterMs = after.getTime();
  const today = DateTime.fromJSDate(after, { zone: timeZone }).startOf('day');

  if (schedule.kind === 'weekly') {
    const time = parseTime(schedule.time);
    const offset = schedule.offsetMinutes ?? 0;
    // Start a day early and run past a full week: an offset can move an
    // occurrence onto the neighbouring date.
    for (let i = -1; i <= 8; i++) {
      const date = today.plus({ days: i });
      if (!schedule.days.includes(dayIndex(date))) continue;
      const candidate = date.set(time).plus({ minutes: offset });
      if (candidate.toMillis() > afterMs) return candidate.toJSDate();
    }
    return null;
  }

  const start = parseTime(schedule.start);
  const end = parseTime(schedule.end);
  const stepMs = schedule.everyMinutes * 60_000;
  for (let i = 0; i <= 7; i++) {
    const date = today.plus({ days: i });
    if (!schedule.days.includes(dayIndex(date))) continue;
    const startMs = date.set(start).toMillis();
    const endMs = date.set(end).toMillis();
    if (afterMs < startMs) return new Date(startMs);
    const steps = Math.floor((afterMs - startMs) / stepMs) + 1;
    const candidate = startMs + steps * stepMs;
    if (candidate <= endMs) return new Date(candidate);
  }
  return null;
}

/** Whether `at` falls inside the quiet period. Start is inclusive, end exclusive. */
export function isInQuietHours(
  at: Date,
  quiet: Settings['general.quietHours'],
  timeZone: string,
): boolean {
  if (!quiet.enabled) return false;
  const local = DateTime.fromJSDate(at, { zone: timeZone });
  const now = local.hour * 60 + local.minute;
  const s = parseTime(quiet.start);
  const e = parseTime(quiet.end);
  const start = s.hour * 60 + s.minute;
  const end = e.hour * 60 + e.minute;
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
