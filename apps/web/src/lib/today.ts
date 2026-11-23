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
