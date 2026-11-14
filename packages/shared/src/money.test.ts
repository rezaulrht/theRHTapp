import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  budgetState,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  compare,
  deltasFor,
  type LedgerEntry,
  loanDelta,
  monthOf,
  owedBy,
  parseAmount,
  previousMonth,
  spendingByDayType,
  summariseMonth,
  todayIn,
} from './money';
import { defaultSettings } from './settings';

const e = (over: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'x',
  kind: 'expense',
  date: '2026-11-13',
  amount: 0,
  accountId: 'cash',
  accountDelta: 0,
  toAccountId: null,
  toAccountDelta: null,
  categoryId: null,
  personId: null,
  loanDirection: null,
  ...over,
});
const expense = (id: string, date: string, amount: number, categoryId: string | null = 'food') =>
  e({ id, date, amount, accountDelta: -amount, categoryId });

describe('parseAmount', () => {
  it.each([
    ['80', 8000],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1,250', 125000],
    ['.5', 50],
    [' 80 ', 8000],
    ['20000000', 2_000_000_000],
    ['0.01', 1],
  ])('accepts %s', (input, paisa) => {
    expect(parseAmount(input)).toEqual({ ok: true, paisa });
  });

  it.each([
    ['', 'Enter an amount'],
    ['   ', 'Enter an amount'],
    ['abc', 'Enter a number, like 80 or 12.50'],
    ['-5', 'Enter a number, like 80 or 12.50'],
    ['12.5.5', 'Enter a number, like 80 or 12.50'],
    ['1e3', 'Enter a number, like 80 or 12.50'],
    ['0', 'Enter an amount above zero'],
    ['0.00', 'Enter an amount above zero'],
    ['12.345', 'Use at most two decimal places'],
    ['20000001', 'That amount is too large'],
  ])('refuses %j', (input, message) => {
    expect(parseAmount(input)).toEqual({ ok: false, message });
  });

  it('does not lose a paisa to floating point', () => {
    expect(parseAmount('0.29')).toEqual({ ok: true, paisa: 29 });
    expect(parseAmount('1.15')).toEqual({ ok: true, paisa: 115 });
    expect(parseAmount('4.35')).toEqual({ ok: true, paisa: 435 });
  });
});

describe('deltas', () => {
  it('deltasFor', () => {
    expect(deltasFor('expense', 8000)).toEqual({ accountDelta: -8000, toAccountDelta: null });
    expect(deltasFor('income', 8000)).toEqual({ accountDelta: 8000, toAccountDelta: null });
    expect(deltasFor('transfer', 8000)).toEqual({ accountDelta: -8000, toAccountDelta: 8000 });
  });

  it('loanDelta', () => {
    expect(loanDelta('lent', 500)).toBe(-500);
    expect(loanDelta('borrowed', 500)).toBe(500);
    expect(loanDelta('repaid_to_me', 500)).toBe(500);
    expect(loanDelta('repaid_by_me', 500)).toBe(-500);
  });
});

describe('balanceOf', () => {
  it('follows every kind of entry, and editing or deleting one changes it', () => {
    const cash = { id: 'cash', openingBalance: 100000 };
    const entries = [
      e({ id: '1', amount: 8000, accountDelta: -8000 }),
      e({ id: '2', kind: 'income', amount: 50000, accountDelta: 50000 }),
      e({
        id: '3',
        kind: 'transfer',
        amount: 200000,
        accountId: 'bank',
        accountDelta: -200000,
        toAccountId: 'cash',
        toAccountDelta: 200000,
      }),
      e({ id: '4', kind: 'correction', amount: 500, accountDelta: -500 }),
      e({ id: '5', kind: 'loan', amount: 30000, accountDelta: -30000, personId: 'p', loanDirection: 'lent' }),
    ];
    expect(balanceOf(cash, entries)).toBe(100000 - 8000 + 50000 + 200000 - 500 - 30000);

    entries[0] = e({ id: '1', amount: 6000, accountDelta: -6000 });
    expect(balanceOf(cash, entries)).toBe(100000 - 6000 + 50000 + 200000 - 500 - 30000);
    expect(balanceOf(cash, entries.slice(1))).toBe(100000 + 50000 + 200000 - 500 - 30000);
  });

  it('takes the sending side of a transfer from the other account', () => {
    const bank = { id: 'bank', openingBalance: 500000 };
    const transfer = e({
      kind: 'transfer',
      amount: 200000,
      accountId: 'bank',
      accountDelta: -200000,
      toAccountId: 'cash',
      toAccountDelta: 200000,
    });
    expect(balanceOf(bank, [transfer])).toBe(300000);
  });

  it('is the opening balance with no entries', () => {
    expect(balanceOf({ id: 'cash', openingBalance: 4200 }, [])).toBe(4200);
  });
});

describe('owedBy', () => {
  const loan = (direction: LedgerEntry['loanDirection'], amount: number, personId = 'p') =>
    e({ kind: 'loan', amount, personId, loanDirection: direction, accountDelta: loanDelta(direction!, amount) });

  it('is positive when they owe the owner', () => {
    expect(owedBy('p', [loan('lent', 50000), loan('repaid_to_me', 20000)])).toBe(30000);
  });

  it('is negative when the owner owes them', () => {
    expect(owedBy('p', [loan('borrowed', 120000), loan('repaid_by_me', 20000)])).toBe(-100000);
  });

  it('is zero when settled and ignores other people', () => {
    expect(owedBy('p', [loan('lent', 500), loan('repaid_to_me', 500), loan('lent', 999, 'q')])).toBe(0);
  });
});

describe('summariseMonth', () => {
  const entries = [
    expense('1', '2026-11-01', 8000, 'travel'),
    expense('2', '2026-11-13', 15000, 'food'),
    expense('3', '2026-11-30', 5000, 'food'),
    expense('4', '2026-11-20', 1850, 'fees'),
    expense('5', '2026-10-31', 99999, 'food'),
    expense('6', '2026-12-01', 99999, 'food'),
    e({ id: '7', kind: 'income', date: '2026-11-05', amount: 4000000, accountDelta: 4000000 }),
    e({ id: '8', kind: 'transfer', date: '2026-11-06', amount: 200000, accountDelta: -200000, toAccountId: 'cash', toAccountDelta: 200000 }),
    e({ id: '9', kind: 'correction', date: '2026-11-07', amount: 500, accountDelta: -500 }),
    e({ id: '10', kind: 'loan', date: '2026-11-08', amount: 50000, accountDelta: -50000, personId: 'p', loanDirection: 'lent' }),
  ];

  it('counts only that month, and only expenses as spending', () => {
    const summary = summariseMonth('2026-11', entries);
    expect(summary.month).toBe('2026-11');
    expect(summary.spent).toBe(8000 + 15000 + 5000 + 1850);
    expect(summary.income).toBe(4000000);
  });

  it('lists categories largest first with their share', () => {
    const { byCategory, spent } = summariseMonth('2026-11', entries);
    expect(byCategory.map((c) => [c.categoryId, c.spent])).toEqual([
      ['food', 20000],
      ['travel', 8000],
      ['fees', 1850],
    ]);
    expect(byCategory[0]!.share).toBeCloseTo(20000 / spent);
    expect(byCategory.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1);
  });

  it('is all zeros for an empty month', () => {
    expect(summariseMonth('2026-09', entries)).toEqual({ month: '2026-09', spent: 0, income: 0, byCategory: [] });
  });
});

describe('compare', () => {
  it('gives the change and percentage', () => {
    expect(compare(11200, 10000)).toEqual({ current: 11200, previous: 10000, change: 1200, percent: 12 });
    expect(compare(7500, 10000)).toEqual({ current: 7500, previous: 10000, change: -2500, percent: -25 });
  });

  it('has nothing to compare when there is no earlier figure', () => {
    expect(compare(500, null)).toEqual({ current: 500, previous: null, change: null, percent: null });
  });

  it('does not divide by zero', () => {
    expect(compare(500, 0)).toEqual({ current: 500, previous: 0, change: 500, percent: null });
    expect(compare(0, 0)).toEqual({ current: 0, previous: 0, change: 0, percent: null });
  });
});

describe('spendingByDayType', () => {
  const week = defaultSettings['general.weekPattern'];

  it('splits spending by the kind of day', () => {
    const result = spendingByDayType(
      [
        expense('1', '2026-11-12', 30000), // Thursday, workday
        expense('2', '2026-11-12', 1000), // same day
        expense('3', '2026-11-14', 20000), // Saturday, workday
        expense('4', '2026-11-13', 23500), // Friday, class day
      ],
      week,
    );
    expect(result).toEqual([
      { dayTypeId: 'workday', total: 51000, days: 2, average: 25500 },
      { dayTypeId: 'classday', total: 23500, days: 1, average: 23500 },
    ]);
  });

  it('ignores entries that are not expenses and omits day types with no spending', () => {
    const result = spendingByDayType(
      [e({ kind: 'income', date: '2026-11-13', amount: 999, accountDelta: 999 }), expense('1', '2026-11-12', 100)],
      week,
    );
    expect(result).toEqual([{ dayTypeId: 'workday', total: 100, days: 1, average: 100 }]);
  });
});

describe('budgetState', () => {
  it.each([
    [7900, 'ok'],
    [8000, 'warning'],
    [10000, 'warning'],
    [10001, 'over'],
  ] as const)('spent %s of 10000 at 80%% is %s', (spent, state) => {
    expect(budgetState(spent, 10000, 80)).toBe(state);
  });

  it('treats a zero budget as exceeded by any spending', () => {
    expect(budgetState(0, 0, 80)).toBe('ok');
    expect(budgetState(1, 0, 80)).toBe('over');
  });
});

describe('dates', () => {
  it('monthOf and previousMonth', () => {
    expect(monthOf('2026-11-13')).toBe('2026-11');
    expect(previousMonth('2026-11')).toBe('2026-10');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  it('todayIn uses the given time zone', () => {
    const late = new Date('2026-11-13T20:00:00Z');
    expect(todayIn('Asia/Dhaka', late)).toBe('2026-11-14');
    expect(todayIn('UTC', late)).toBe('2026-11-13');
  });
});

describe('category choices', () => {
  it('offers eight colours and twelve icons, each with a unique key', () => {
    expect(Object.keys(CATEGORY_COLORS)).toHaveLength(8);
    expect(new Set(CATEGORY_ICONS).size).toBe(12);
    for (const value of Object.values(CATEGORY_COLORS)) expect(value).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
