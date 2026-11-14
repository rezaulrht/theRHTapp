function hourIn(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date);
  return Number(hour);
}

/** A greeting for the time of day in the given time zone. */
export function greetingFor(date: Date, timeZone: string): string {
  const hour = hourIn(date, timeZone);
  if (hour < 4) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
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
