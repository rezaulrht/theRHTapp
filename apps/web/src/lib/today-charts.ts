import type { Entry } from './money';
import { addDays } from './money-text';

/** "Mon" for a calendar day. */
export function weekdayShort(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

/** What was spent on each of the `days` days up to and including `today`, oldest first. Only expenses count. */
export function dailySpend(entries: Pick<Entry, 'kind' | 'date' | 'amount'>[], today: string, days = 7): { date: string; spent: number }[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === 'expense') totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.amount);
  }
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - (days - 1));
    return { date, spent: totals.get(date) ?? 0 };
  });
}

/** The tags with the most things on them, most first, leaving out empty ones. */
export function topTags<T extends { count: number }>(tags: T[], limit = 4): T[] {
  return tags
    .filter((tag) => tag.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
