'use client';

import { Amount, Field, Select } from '@pa/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { useSettings } from '@/components/SettingsProvider';
import {
  money,
  type Account,
  type BudgetState,
  type Category,
  type CategoryLine,
  type Entry,
  type MonthReport,
} from '@/lib/money';
import {
  addMonths,
  budgetText,
  categoryChangeText,
  dayTypeText,
  formatMoney,
  lastDayOfMonth,
  monthComparisonText,
  monthLabel,
  monthName,
  todayInZone,
} from '@/lib/money-text';
import { categoryDot, EntryRow } from '../EntryRow';
import { EntrySheet } from '../EntrySheet';

const SEARCH_DELAY_MS = 300;
const ENTRY_LIMIT = 500;

const budgetTone: Record<BudgetState, string> = {
  ok: 'var(--color-sage)',
  warning: 'var(--color-brass)',
  over: 'var(--color-alert)',
};

/** A thin line showing how much of a budget is used. Never drawn past its end. */
function BudgetBar({ spent, budget, state, symbol }: { spent: number; budget: number; state: BudgetState; symbol: string }) {
  const used = budget === 0 ? 1 : Math.min(spent / budget, 1);
  return (
    <div className="mt-2">
      <div className="h-px w-full bg-hairline">
        <motion.div
          className="h-px origin-left"
          style={{ background: budgetTone[state], width: `${used * 100}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 }}
        />
      </div>
      <p className={`mt-1.5 text-xs ${state === 'over' ? 'text-alert' : state === 'warning' ? 'text-brass' : 'text-sage'}`}>
        {budgetText(spent, budget, state, symbol)}
      </p>
    </div>
  );
}

function CategoryRow({
  line,
  largest,
  index,
  previousMonthName,
  symbol,
}: {
  line: CategoryLine;
  largest: number;
  index: number;
  previousMonthName: string;
  symbol: string;
}) {
  const change = categoryChangeText(line.spent, line.previous, previousMonthName, symbol);
  return (
    <li className="border-b border-hairline py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="flex min-w-0 items-baseline gap-2 text-ivory">
          <span className="truncate">{line.name}</span>
          {line.archived ? <span className="text-xs text-sage">archived</span> : null}
        </p>
        <p className="flex shrink-0 items-baseline gap-3">
          <span className="text-sm text-sage tabular-nums">{Math.round(line.share * 100)}%</span>
          <span className="font-display text-lg text-ivory tabular-nums">{formatMoney(line.spent, symbol)}</span>
        </p>
      </div>
      {/* The bar is this category against the largest one, drawn in on arrival. */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ivory/[0.05]">
        <motion.div
          className="h-full origin-left rounded-full"
          style={{ background: categoryDot(line.color), width: `${largest === 0 ? 0 : (line.spent / largest) * 100}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: Math.min(index, 8) * 0.06 }}
        />
      </div>
      {change ? <p className="mt-2 text-xs text-sage">{change}</p> : null}
      {line.budget !== null && line.state !== null ? (
        <BudgetBar spent={line.spent} budget={line.budget} state={line.state} symbol={symbol} />
      ) : null}
    </li>
  );
}

/** The month-end page of the notebook: where the money went, against the month before. */
export function MonthView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const symbol = settings?.['general.currency'].symbol ?? '';
  const today = timeZone ? todayInZone(timeZone) : null;
  const currentMonth = today?.slice(0, 7) ?? null;

  const [month, setMonth] = useState<string | null>(null);
  const [report, setReport] = useState<MonthReport | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Entry | null>(null);
  const latestReport = useRef(0);
  const latestEntries = useRef(0);

  useEffect(() => {
    if (currentMonth && month === null) setMonth(currentMonth);
  }, [currentMonth, month]);

  // Typing does not ask the server on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const fail = (caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.');

  const loadReport = useCallback(async () => {
    if (!month) return;
    const load = ++latestReport.current;
    try {
      const [loadedReport, loadedAccounts, loadedCategories] = await Promise.all([
        money.month(month),
        money.accounts(true),
        money.categories(true),
      ]);
      if (load !== latestReport.current) return;
      setReport(loadedReport);
      setAccounts(loadedAccounts);
      setCategories(loadedCategories);
      setError(null);
    } catch (caught) {
      if (load === latestReport.current) fail(caught);
    }
  }, [month]);

  const loadEntries = useCallback(async () => {
    if (!month) return;
    const load = ++latestEntries.current;
    try {
      const loaded = await money.entries({
        from: `${month}-01`,
        to: lastDayOfMonth(month),
        accountId,
        categoryId,
        q: search,
        limit: ENTRY_LIMIT,
      });
      if (load === latestEntries.current) setEntries(loaded);
    } catch (caught) {
      if (load === latestEntries.current) fail(caught);
    }
  }, [month, accountId, categoryId, search]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);
  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const afterChange = useCallback(() => {
    setOpen(null);
    void loadReport();
    void loadEntries();
  }, [loadReport, loadEntries]);

  if (!month || !currentMonth || !today || !report || report.month !== month) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Adding up the month…</p>
    );
  }

  const previousName = monthName(addMonths(month, -1));
  const largest = report.byCategory.reduce((most, line) => Math.max(most, line.spent), 0);
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const category = new Map(categories.map((item) => [item.id, item]));
  const filtered = accountId !== '' || categoryId !== '' || search !== '';

  return (
    <>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ivory md:text-3xl">
            <Reveal key={month}>{monthLabel(month)}</Reveal>
          </h2>
          <p className="mt-3 text-sm text-sage">Spent</p>
          <Amount
            value={report.spent.current / 100}
            currency={symbol}
            animate
            className="mt-2 block text-6xl leading-none text-ivory md:text-7xl"
          />
          <p className="mt-3 text-sm text-brass">{monthComparisonText(report.spent, previousName, symbol)}</p>
          {report.income.current > 0 ? (
            <p className="mt-1 text-sm text-sage">
              Came in {formatMoney(report.income.current, symbol)}.{' '}
              {monthComparisonText(report.income, previousName, symbol)}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
            className="grid size-11 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-ivory"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= currentMonth}
            onClick={() => setMonth(addMonths(month, 1))}
            className="grid size-11 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-ivory disabled:opacity-30"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mb-4 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {report.overall.budget !== null && report.overall.state !== null ? (
        <section aria-label="Month budget" className="mb-10">
          <h3 className="text-sm text-sage">Budget for the month</h3>
          <BudgetBar
            spent={report.spent.current}
            budget={report.overall.budget}
            state={report.overall.state}
            symbol={symbol}
          />
        </section>
      ) : null}

      <section className="mb-10">
        <h3 className="mb-2 font-display text-xl text-ivory">Where it went</h3>
        {report.byCategory.length === 0 ? (
          <p className="border-y border-hairline py-10 text-center text-sage">Nothing spent this month.</p>
        ) : (
          <ul key={month} aria-label="Spending by category" className="border-t border-hairline">
            {report.byCategory.map((line, index) => (
              <CategoryRow
                key={line.categoryId ?? 'none'}
                line={line}
                largest={largest}
                index={index}
                previousMonthName={previousName}
                symbol={symbol}
              />
            ))}
          </ul>
        )}
      </section>

      {report.byDayType.length > 0 ? (
        <section className="mb-10">
          <h3 className="mb-3 font-display text-xl text-ivory">By kind of day</h3>
          <ul className="flex flex-col gap-1.5 text-sage">
            {report.byDayType.map((group) => (
              <li key={group.dayTypeId}>{dayTypeText(group.name, group.average, group.days, symbol)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="mb-4 font-display text-xl text-ivory">Every entry</h3>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select label="Account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
          <Select label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archived ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
          <Field
            label="Search"
            type="search"
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>

        {entries === null ? (
          <p className="text-sage">Loading entries…</p>
        ) : entries.length === 0 ? (
          <p className="border-y border-hairline py-10 text-center text-sage">
            {filtered ? 'No entries match.' : 'Nothing logged this month.'}
          </p>
        ) : (
          <ul aria-label="Entries" className="border-t border-hairline">
            {entries.map((entry) => (
              <li key={entry.id} className="border-b border-hairline">
                <EntryRow
                  entry={entry}
                  accountName={accountName.get(entry.accountId) ?? 'Account'}
                  category={entry.categoryId ? category.get(entry.categoryId) : undefined}
                  symbol={symbol}
                  showDate
                  onOpen={() => setOpen(entry)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {open ? (
        <EntrySheet
          entry={open}
          accounts={accounts}
          categories={categories}
          symbol={symbol}
          today={today}
          onClose={() => setOpen(null)}
          onChanged={afterChange}
        />
      ) : null}
    </>
  );
}
