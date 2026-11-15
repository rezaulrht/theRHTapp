import type { BudgetState, Comparison } from './money';

/** Paisa as money text: "৳1,250.50", or "৳80" when there are no paisa. */
export function formatMoney(paisa: number, symbol: string): string {
  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: paisa % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(paisa) / 100);
  return `${paisa < 0 ? '−' : ''}${symbol}${number}`;
}

/** Today's calendar day, 'YYYY-MM-DD', in the given time zone. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  // The Canadian English locale happens to write dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Friday, 13 November" for a calendar day. */
export function dayLabel(day: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${day}T00:00:00Z`));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')}`;
}

export function weekdayName(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

/** "November 2026" for 'YYYY-MM'. */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

export function monthName(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

export function addMonths(month: string, months: number): string {
  const [year = 1970, monthNumber = 1] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Today's spending against the same weekday last week:
 * "৳65 less than last Friday". Empty when there is nothing to compare with.
 */
export function todayComparisonText(comparison: Comparison, day: string, symbol: string): string {
  if (comparison.previous === null || comparison.change === null) return '';
  const weekday = weekdayName(day);
  if (comparison.change === 0) return `Same as last ${weekday}`;
  const amount = formatMoney(Math.abs(comparison.change), symbol);
  return `${amount} ${comparison.change < 0 ? 'less' : 'more'} than last ${weekday}`;
}

/** A month's figure against the month before: "12% more than October". */
export function monthComparisonText(comparison: Comparison, previousMonthName: string, symbol: string): string {
  if (comparison.previous === null || comparison.change === null) return 'No earlier month to compare';
  if (comparison.change === 0) return `Same as ${previousMonthName}`;
  const direction = comparison.change < 0 ? 'less' : 'more';
  // A percentage means nothing against a month of zero; give the amount instead.
  const size =
    comparison.percent === null
      ? formatMoney(Math.abs(comparison.change), symbol)
      : `${Math.abs(comparison.percent)}%`;
  return `${size} ${direction} than ${previousMonthName}`;
}

/** Where spending stands against a budget, in words. */
export function budgetText(spent: number, budget: number, state: BudgetState, symbol: string): string {
  if (state === 'over') return `Over budget by ${formatMoney(spent - budget, symbol)}`;
  const used = budget === 0 ? 0 : Math.floor((spent * 100) / budget);
  return `${used}% of ${formatMoney(budget, symbol)} budget used`;
}

/** What is between the owner and a person: "Rahim owes you ৳500". */
export function owedText(name: string, owed: number, symbol: string): string {
  if (owed === 0) return `Settled with ${name}`;
  return owed > 0
    ? `${name} owes you ${formatMoney(owed, symbol)}`
    : `You owe ${name} ${formatMoney(-owed, symbol)}`;
}

/** "13 Nov" for a calendar day, for lists that span a month. */
export function shortDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** The last calendar day of 'YYYY-MM'. */
export function lastDayOfMonth(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

/** "Workday: ৳310 a day over 22 days". */
export function dayTypeText(name: string, average: number, days: number, symbol: string): string {
  return `${name}: ${formatMoney(Math.round(average), symbol)} a day over ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** One category against the month before: "৳500 more than October". Empty with nothing to compare. */
export function categoryChangeText(
  spent: number,
  previous: number | null,
  previousMonthName: string,
  symbol: string,
): string {
  if (previous === null) return '';
  if (previous === 0) return spent === 0 ? '' : `Nothing in ${previousMonthName}`;
  const change = spent - previous;
  if (change === 0) return `Same as ${previousMonthName}`;
  return `${formatMoney(Math.abs(change), symbol)} ${change < 0 ? 'less' : 'more'} than ${previousMonthName}`;
}
