import { DateTime } from 'luxon';
import { WEEK_DAYS, type Settings } from './settings';

// All amounts are whole paisa. 100 paisa = 1 taka. Dates are calendar days,
// 'YYYY-MM-DD', in the owner's time zone.

export type EntryKind = 'expense' | 'income' | 'transfer' | 'correction' | 'loan';
export const ENTRY_KINDS = ['expense', 'income', 'transfer', 'correction', 'loan'] as const;

export type LoanDirection = 'lent' | 'borrowed' | 'repaid_to_me' | 'repaid_by_me';
export const LOAN_DIRECTIONS = ['lent', 'borrowed', 'repaid_to_me', 'repaid_by_me'] as const;

/** The largest single amount accepted: 20,000,000 taka. Keeps sums well inside safe integers. */
export const MAX_AMOUNT = 2_000_000_000;

/** Colours a category can take. All read clearly on the green ground. */
export const CATEGORY_COLORS = {
  brass: '#c8a662',
  coral: '#e8795f',
  sky: '#7fb7d9',
  sage: '#9fb3a8',
  rose: '#d98fa6',
  lilac: '#a99bd6',
  mint: '#7fd1ae',
  sand: '#d9c7a0',
} as const;
export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const CATEGORY_ICONS = [
  'bus',
  'food',
  'book',
  'bill',
  'fee',
  'bag',
  'home',
  'health',
  'phone',
  'gift',
  'coffee',
  'dot',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

/**
 * An entry as the maths needs it. `amount` is always positive. `accountDelta`
 * is the entry's signed effect on `accountId`; a transfer also has
 * `toAccountDelta` for the receiving account. Storing the effect is what lets
 * one sum give a balance, whatever kinds of entry are involved.
 */
export interface LedgerEntry {
  id: string;
  kind: EntryKind;
  date: string;
  amount: number;
  accountId: string;
  accountDelta: number;
  toAccountId: string | null;
  toAccountDelta: number | null;
  categoryId: string | null;
  personId: string | null;
  loanDirection: LoanDirection | null;
}

export type ParsedAmount = { ok: true; paisa: number } | { ok: false; message: string };

/**
 * Reads an amount typed by hand, in taka, into paisa. Works on the digits
 * directly so no paisa is lost to floating point.
 */
export function parseAmount(input: string): ParsedAmount {
  const text = input.trim();
  if (text === '') return { ok: false, message: 'Enter an amount' };

  const match = /^(\d*|\d{1,3}(?:,\d{3})+)(?:\.(\d*))?$/.exec(text);
  const whole = match?.[1]?.replace(/,/g, '') ?? '';
  const fraction = match?.[2] ?? '';
  if (!match || (whole === '' && fraction === '')) {
    return { ok: false, message: 'Enter a number, like 80 or 12.50' };
  }
  if (fraction.length > 2) return { ok: false, message: 'Use at most two decimal places' };
  if (whole.replace(/^0+/, '').length > 9) return { ok: false, message: 'That amount is too large' };

  const paisa = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (paisa === 0) return { ok: false, message: 'Enter an amount above zero' };
  if (paisa > MAX_AMOUNT) return { ok: false, message: 'That amount is too large' };
  return { ok: true, paisa };
}

/** The effect of a plain entry on its account, and on the receiving account for a transfer. */
export function deltasFor(
  kind: 'expense' | 'income' | 'transfer',
  amount: number,
): { accountDelta: number; toAccountDelta: number | null } {
  if (kind === 'income') return { accountDelta: amount, toAccountDelta: null };
  if (kind === 'transfer') return { accountDelta: -amount, toAccountDelta: amount };
  return { accountDelta: -amount, toAccountDelta: null };
}

/** The effect of a loan entry on the account the money left or entered. */
export function loanDelta(direction: LoanDirection, amount: number): number {
  return direction === 'borrowed' || direction === 'repaid_to_me' ? amount : -amount;
}

/** An account's balance: its opening balance plus the effect of every entry that touches it. */
export function balanceOf(account: { id: string; openingBalance: number }, entries: LedgerEntry[]): number {
  let balance = account.openingBalance;
  for (const entry of entries) {
    if (entry.accountId === account.id) balance += entry.accountDelta;
    if (entry.toAccountId === account.id) balance += entry.toAccountDelta ?? 0;
  }
  return balance;
}

/** What a person owes the owner. Negative when the owner owes them. */
export function owedBy(personId: string, entries: LedgerEntry[]): number {
  let owed = 0;
  for (const entry of entries) {
    if (entry.kind !== 'loan' || entry.personId !== personId) continue;
    // Money out of the owner's account raises what they owe; money in lowers it.
    owed -= entry.accountDelta;
  }
  return owed;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function previousMonth(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  return monthNumber === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNumber - 1).padStart(2, '0')}`;
}

/** Today's calendar day in the given time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone: timeZone }).toFormat('yyyy-MM-dd');
}

export interface MonthSummary {
  /** 'YYYY-MM' */
  month: string;
  spent: number;
  income: number;
  /** Largest first. `share` is this category's part of `spent`, from 0 to 1. */
  byCategory: { categoryId: string | null; spent: number; share: number }[];
}

/**
 * Totals for one month. Only expenses count as spending (transfer fees are
 * expenses, so they do). Transfers, corrections and loans move money without
 * spending or earning it, and count as neither.
 */
export function summariseMonth(month: string, entries: LedgerEntry[]): MonthSummary {
  let spent = 0;
  let income = 0;
  const categories = new Map<string | null, number>();
  for (const entry of entries) {
    if (monthOf(entry.date) !== month) continue;
    if (entry.kind === 'expense') {
      spent += entry.amount;
      categories.set(entry.categoryId, (categories.get(entry.categoryId) ?? 0) + entry.amount);
    } else if (entry.kind === 'income') {
      income += entry.amount;
    }
  }
  const byCategory = [...categories.entries()]
    .map(([categoryId, amount]) => ({ categoryId, spent: amount, share: spent === 0 ? 0 : amount / spent }))
    .sort((a, b) => b.spent - a.spent);
  return { month, spent, income, byCategory };
}

export interface Comparison {
  current: number;
  /** Null when there is nothing earlier to compare with. */
  previous: number | null;
  change: number | null;
  /** Whole percent, rounded. Null when there is no earlier figure or it was zero. */
  percent: number | null;
}

export function compare(current: number, previous: number | null): Comparison {
  if (previous === null) return { current, previous: null, change: null, percent: null };
  const change = current - previous;
  return {
    current,
    previous,
    change,
    percent: previous === 0 ? null : Math.round((change / previous) * 100),
  };
}

function weekDayOf(date: string): (typeof WEEK_DAYS)[number] {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return WEEK_DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
}

/**
 * Spending split by the kind of day (workday, class day, …). `days` counts the
 * days of that kind on which something was spent, and `average` is per such
 * day. Largest total first; kinds of day with no spending are left out.
 */
export function spendingByDayType(
  entries: LedgerEntry[],
  weekPattern: Settings['general.weekPattern'],
): { dayTypeId: string; total: number; days: number; average: number }[] {
  const groups = new Map<string, { total: number; dates: Set<string> }>();
  for (const entry of entries) {
    if (entry.kind !== 'expense') continue;
    const dayTypeId = weekPattern[weekDayOf(entry.date)];
    const group = groups.get(dayTypeId) ?? { total: 0, dates: new Set<string>() };
    group.total += entry.amount;
    group.dates.add(entry.date);
    groups.set(dayTypeId, group);
  }
  return [...groups.entries()]
    .map(([dayTypeId, { total, dates }]) => ({
      dayTypeId,
      total,
      days: dates.size,
      average: Math.round(total / dates.size),
    }))
    .sort((a, b) => b.total - a.total);
}

export type BudgetState = 'ok' | 'warning' | 'over';

/** Where spending stands against a budget. `warnPercent` is the warning level, 1 to 100. */
export function budgetState(spent: number, budget: number, warnPercent: number): BudgetState {
  if (spent > budget) return 'over';
  if (spent > 0 && spent * 100 >= budget * warnPercent) return 'warning';
  return 'ok';
}
