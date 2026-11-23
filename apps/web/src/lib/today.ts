export interface ClockParts {
  /** "01" to "12". */
  hours: string;
  minutes: string;
  seconds: string;
  period: 'am' | 'pm';
}

/** The time of day split for a clock face, on a 12-hour dial like the rest of the app, in the given time zone. */
export function clockParts(date: Date, timeZone: string): ClockParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h12',
    timeZone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    hours: get('hour'),
    minutes: get('minute'),
    seconds: get('second'),
    period: get('dayPeriod').toLowerCase() === 'pm' ? 'pm' : 'am',
  };
}

export const PRAYER_ORDER = ['fajr', 'zuhr', 'asr', 'maghrib', 'isha'] as const;
export type PrayerName = (typeof PRAYER_ORDER)[number];

export interface PrayerStanding {
  /** The prayer whose time has begun and not yet been followed by the next, or null before Fajr. */
  current: PrayerName | null;
  /** The next prayer to begin, or null once Isha has begun and tomorrow's Fajr is not known. */
  next: PrayerName | 'tomorrow-fajr' | null;
  /** Milliseconds until `next` begins, or null when there is none. */
  untilNextMs: number | null;
}

/** Where the day stands among the five prayers at `now`. `tomorrowFajr` is optional. */
export function prayerStanding(
  times: Record<PrayerName, string>,
  now: Date,
  tomorrowFajr?: string,
): PrayerStanding {
  let current: PrayerName | null = null;
  for (const name of PRAYER_ORDER) {
    if (new Date(times[name]).getTime() <= now.getTime()) current = name;
  }
  const index = current === null ? 0 : PRAYER_ORDER.indexOf(current) + 1;
  const upcoming = PRAYER_ORDER[index];
  if (upcoming !== undefined) {
    return { current, next: upcoming, untilNextMs: new Date(times[upcoming]).getTime() - now.getTime() };
  }
  if (tomorrowFajr !== undefined) {
    return { current, next: 'tomorrow-fajr', untilNextMs: new Date(tomorrowFajr).getTime() - now.getTime() };
  }
  return { current, next: null, untilNextMs: null };
}

/** "1 h 05 min", "12 min", or "under a minute". */
export function untilText(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} min` : `${hours} h ${String(rest).padStart(2, '0')} min`;
}

/** For example "Saturday, 14 November", in the given time zone. */
export function longDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')}`;
}
