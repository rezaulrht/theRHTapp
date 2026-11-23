'use client';

import { Button, Field } from '@pa/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { useSettings } from '@/components/SettingsProvider';
import { habits, pointsText, type DayItem, type DayReport } from '@/lib/habits';
import { habitToday } from '@/lib/habits-text';
import { addDays, dayLabel } from '@/lib/money-text';
import { ItemRow } from './ItemRow';
import { SheetPresence } from '@/components/Sheet';
import { MarkSheet } from './MarkSheet';
import { ScoreHeader } from './ScoreHeader';

/** The routine for one habit day: the score, what is next, and every item to tick. */
export function DayView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const dayEndHour = settings?.['habits.dayEndHour'];
  const today = timeZone !== undefined && dayEndHour !== undefined ? habitToday(timeZone, dayEndHour) : null;

  const [day, setDay] = useState<string | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [busyItems, setBusyItems] = useState<string[]>([]);
  const [askingSkip, setAskingSkip] = useState(false);
  const [reason, setReason] = useState('');
  const [skipBusy, setSkipBusy] = useState(false);
  const ticking = useRef(new Set<string>());
  const latestLoad = useRef(0);

  useEffect(() => {
    if (!today || day !== null) return;
    // Arriving from a bar on the progress page opens that day.
    const asked = new URLSearchParams(window.location.search).get('day');
    if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today) {
      setDay(asked);
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      setDay(today);
    }
  }, [today, day]);

  const load = useCallback(async () => {
    if (!day) return;
    const request = ++latestLoad.current;
    try {
      const loaded = await habits.day(day);
      if (request !== latestLoad.current) return;
      setReport(loaded);
      setError(null);
    } catch (caught) {
      if (request === latestLoad.current) setError(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, [day]);

  useEffect(() => {
    void load();
  }, [load]);

  // The page is left open through the day: what is pending and what is next move with the clock.
  useEffect(() => {
    if (!day || day !== today) return;
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [day, today, load]);

  /** Takes a fresh report from the server after a change. */
  const accept = useCallback((fresh: DayReport) => {
    latestLoad.current += 1;
    setReport(fresh);
    setError(null);
    setOpenItem(null);
  }, []);

  async function tick(item: DayItem) {
    // One tap, one tick: a second tap while the first is being saved does nothing.
    if (!day || ticking.current.has(item.itemId)) return;
    ticking.current.add(item.itemId);
    setBusyItems([...ticking.current]);
    try {
      accept(await habits.mark(day, item.itemId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      ticking.current.delete(item.itemId);
      setBusyItems([...ticking.current]);
    }
  }

  async function skipDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!day || skipBusy) return;
    setSkipBusy(true);
    try {
      accept(await habits.skipDay(day, reason.trim() || undefined));
      setAskingSkip(false);
      setReason('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setSkipBusy(false);
    }
  }

  async function unskipDay() {
    if (!day || skipBusy) return;
    setSkipBusy(true);
    try {
      accept(await habits.unskipDay(day));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setSkipBusy(false);
    }
  }

  if (!day || !today || !timeZone || dayEndHour === undefined || !report || report.day !== day) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Opening your routine…</p>
    );
  }

  const open = openItem ? report.items.find((item) => item.itemId === openItem) : undefined;
  const losses = report.closed
    ? report.items
        .filter((item) => item.outcome === 'late' || item.outcome === 'missed')
        .map((item) => ({ item, lost: item.points - item.score }))
        .sort((a, b) => b.lost - a.lost)
    : [];

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h2 className="mb-5 font-display text-2xl text-ivory md:text-3xl">
            <Reveal key={day}>{day === today ? 'Today' : dayLabel(day)}</Reveal>
          </h2>
          {report.items.length > 0 ? <ScoreHeader key={day} report={report} timeZone={timeZone} /> : null}
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
          <label htmlFor="habits-day" className="sr-only">
            Day
          </label>
          <input
            id="habits-day"
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

      {report.skipped ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-hairline p-4">
          <p className="text-ivory">
            Day skipped{report.skippedReason ? `: ${report.skippedReason}` : ''}
            <span className="block text-sm text-sage">Nothing is scored and no streak is broken.</span>
          </p>
          <Button variant="outline" loading={skipBusy} onClick={() => void unskipDay()}>
            Unskip
          </Button>
        </div>
      ) : null}

      {report.items.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">Nothing on the routine for this day.</p>
      ) : (
        <ul key={day} aria-label="Routine" className="border-t border-hairline">
          {report.items.map((item, index) => (
            <motion.li
              key={item.itemId}
              className="border-b border-hairline"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT, delay: Math.min(index, 10) * 0.035 }}
            >
              <ItemRow
                item={item}
                timeZone={timeZone}
                busy={busyItems.includes(item.itemId) || report.skipped}
                onTick={() => void tick(item)}
                onMore={() => setOpenItem(item.itemId)}
              />
            </motion.li>
          ))}
        </ul>
      )}

      {losses.length > 0 ? (
        <section className="mt-10">
          <h3 className="mb-2 font-display text-xl text-ivory">Where the points went</h3>
          <ul aria-label="Points lost" className="border-t border-hairline">
            {losses.map(({ item, lost }) => (
              <li key={item.itemId} className="flex items-baseline justify-between gap-4 border-b border-hairline py-3">
                <span className="text-ivory">
                  {item.name} <span className="text-sm text-sage">{item.outcome === 'missed' ? 'missed' : 'late'}</span>
                </span>
                <span className="font-display text-lg text-alert tabular-nums">{pointsText(-lost)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.items.length > 0 && !report.skipped ? (
        <div className="mt-8">
          {askingSkip ? (
            <form onSubmit={skipDay} method="post" noValidate className="max-w-md rounded-[var(--radius-control)] border border-hairline p-4">
              <p className="text-sm text-ivory">Skip this whole day? Nothing is scored and no reminders are sent.</p>
              <Field
                className="mt-3"
                label="Reason (optional)"
                autoComplete="off"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <div className="mt-3 flex items-center gap-3">
                <Button type="submit" variant="outline" loading={skipBusy}>
                  Yes, skip it
                </Button>
                <Button variant="quiet" onClick={() => setAskingSkip(false)}>
                  Keep it
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="quiet" className="-ml-6" onClick={() => setAskingSkip(true)}>
              Skip this day
            </Button>
          )}
        </div>
      ) : null}

      <SheetPresence>
        {open ? (
          <MarkSheet
            key={open.itemId}
            item={open}
            day={day}
            timeZone={timeZone}
            dayEndHour={dayEndHour}
            onChanged={accept}
            onClose={() => setOpenItem(null)}
          />
        ) : null}
      </SheetPresence>
    </>
  );
}
