'use client';

import { Amount, Button } from '@pa/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { useSettings } from '@/components/SettingsProvider';
import { Sheet, SheetPresence } from '@/components/Sheet';
import { money, type Account, type Category, type DayReport, type Entry, type Shortcut } from '@/lib/money';
import { addDays, dayLabel, formatMoney, todayInZone } from '@/lib/money-text';
import { BalanceStrip } from './BalanceStrip';
import { EntryForm } from './EntryForm';
import { EntryRow } from './EntryRow';
import { EntrySheet } from './EntrySheet';
import { FixBalanceForm } from './FixBalanceForm';
import { ShortcutBar } from './ShortcutBar';

const SHORTCUT_COOLDOWN_MS = 1000;

type SheetState =
  | { mode: 'add'; preset?: { name: string; amount: number; accountId: string; categoryId: string } }
  | { mode: 'edit'; entry: Entry }
  | { mode: 'fix' };

/** The notebook page for one day: balances, shortcuts, the day's total and its entries. */
export function DayView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const symbol = settings?.['general.currency'].symbol ?? '';
  const today = timeZone ? todayInZone(timeZone) : null;

  const [day, setDay] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [report, setReport] = useState<DayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [busyShortcut, setBusyShortcut] = useState<string | null>(null);
  const usingShortcut = useRef(false);
  const lastShortcut = useRef<{ id: string; at: number } | null>(null);
  const latestLoad = useRef(0);

  useEffect(() => {
    if (today && day === null) setDay(today);
  }, [today, day]);

  // Arriving from "Add expense" on the Today page opens the form straight away.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add') === '1') {
      setSheet({ mode: 'add' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    Promise.all([money.categories(true), money.shortcuts()])
      .then(([loadedCategories, loadedShortcuts]) => {
        setCategories(loadedCategories);
        setShortcuts(loadedShortcuts);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'));
  }, []);

  /** Balances and the day's entries, after any change. */
  const refresh = useCallback(async () => {
    if (!day) return;
    const load = ++latestLoad.current;
    try {
      const [loadedAccounts, loadedReport] = await Promise.all([money.accounts(true), money.day(day)]);
      // A quicker answer for a newer day must not be overwritten by an older one.
      if (load !== latestLoad.current) return;
      setAccounts(loadedAccounts);
      setReport(loadedReport);
      setError(null);
    } catch (caught) {
      if (load === latestLoad.current) setError(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, [day]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const closeSheet = useCallback(() => setSheet(null), []);
  const afterChange = useCallback(() => {
    setSheet(null);
    void refresh();
  }, [refresh]);

  async function useShortcut(shortcut: Shortcut) {
    // A double tap must not record the expense twice: not while the first is
    // being saved, and not just after, when a fast connection has already
    // answered. Recording the same shortcut twice within a second is never meant.
    const now = Date.now();
    const last = lastShortcut.current;
    if (usingShortcut.current || (last && last.id === shortcut.id && now - last.at < SHORTCUT_COOLDOWN_MS)) return;
    lastShortcut.current = { id: shortcut.id, at: now };
    usingShortcut.current = true;
    setBusyShortcut(shortcut.id);
    try {
      await money.useShortcut(shortcut.id, day && day !== today ? { date: day } : {});
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record it. Try again.');
    } finally {
      usingShortcut.current = false;
      setBusyShortcut(null);
    }
  }

  if (!day || !today || !accounts || !report) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Opening your notebook…</p>
    );
  }

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const category = new Map(categories.map((item) => [item.id, item]));

  return (
    <>
      <BalanceStrip accounts={accounts} symbol={symbol} onFix={() => setSheet({ mode: 'fix' })} />

      {day === today ? (
        <ShortcutBar
          shortcuts={shortcuts}
          symbol={symbol}
          busyId={busyShortcut}
          onUse={useShortcut}
          onAdjust={(shortcut) =>
            setSheet({
              mode: 'add',
              preset: {
                name: shortcut.name,
                amount: shortcut.amount,
                accountId: shortcut.accountId,
                categoryId: shortcut.categoryId,
              },
            })
          }
        />
      ) : null}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ivory md:text-3xl">
            <Reveal key={day}>{day === today ? 'Today' : dayLabel(day)}</Reveal>
          </h2>
          <p className="mt-3 text-sm text-sage">Spent</p>
          <Amount
            value={report.spent / 100}
            currency={symbol}
            animate
            className="mt-2 block text-6xl leading-none text-ivory md:text-7xl"
          />
          {report.income > 0 ? (
            <p className="mt-2 text-sm text-brass">Came in {formatMoney(report.income, symbol)}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDay(addDays(day, -1))}
            className="grid size-11 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-ivory"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <label htmlFor="money-day" className="sr-only">
            Day
          </label>
          <input
            id="money-day"
            type="date"
            max={today}
            value={day}
            onChange={(event) => {
              const picked = event.target.value;
              if (picked) setDay(picked > today ? today : picked);
            }}
            className="min-h-11 rounded-full border border-hairline bg-transparent px-3 text-sm text-ivory [color-scheme:dark]"
          />
          <button
            type="button"
            aria-label="Next day"
            disabled={day >= today}
            onClick={() => setDay(addDays(day, 1))}
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

      {report.entries.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">Nothing logged for this day yet.</p>
      ) : (
        <ul aria-label="Entries" className="border-t border-hairline">
          {report.entries.map((entry, index) => {
            return (
              <motion.li
                key={entry.id}
                className="border-b border-hairline"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: Math.min(index, 8) * 0.04 }}
              >
                <EntryRow
                  entry={entry}
                  accountName={accountName.get(entry.accountId) ?? 'Account'}
                  category={entry.categoryId ? category.get(entry.categoryId) : undefined}
                  symbol={symbol}
                  onOpen={() => setSheet({ mode: 'edit', entry })}
                />
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* On a phone this floats above the navigation bar, within reach of a thumb. */}
      <div className="fixed inset-x-5 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:static md:mt-8 md:flex md:justify-end">
        <Button onClick={() => setSheet({ mode: 'add' })} className="w-full bg-ground md:w-auto">
          Add expense
        </Button>
      </div>

      <SheetPresence>
        {sheet?.mode === 'add' ? (
          <Sheet key="add" title="New entry" onClose={closeSheet}>
            <EntryForm
              accounts={accounts}
              categories={categories}
              preset={sheet.preset}
              defaultDate={day}
              maxDate={today}
              onSaved={afterChange}
              onCancel={closeSheet}
            />
          </Sheet>
        ) : null}

        {sheet?.mode === 'edit' ? (
          <EntrySheet
            key="edit"
            entry={sheet.entry}
            accounts={accounts}
            categories={categories}
            symbol={symbol}
            today={today}
            onClose={closeSheet}
            onChanged={afterChange}
          />
        ) : null}

        {sheet?.mode === 'fix' ? (
          <Sheet key="fix" title="Fix a balance" onClose={closeSheet}>
            <FixBalanceForm accounts={accounts} symbol={symbol} date={day} onSaved={afterChange} onCancel={closeSheet} />
          </Sheet>
        ) : null}
      </SheetPresence>
    </>
  );
}
