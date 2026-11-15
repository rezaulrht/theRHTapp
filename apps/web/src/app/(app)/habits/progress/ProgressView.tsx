'use client';

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { useSettings } from '@/components/SettingsProvider';
import { habits, pointsText, type DayScore, type ItemStats } from '@/lib/habits';
import { habitToday, missRateText, streakText } from '@/lib/habits-text';
import { addDays, addMonths, lastDayOfMonth, monthLabel, shortDay } from '@/lib/money-text';
import { ScoreChart } from './ScoreChart';

type Span = 'week' | 'month';

/** The owner's week, Saturday to Friday, that a day falls in. */
export function weekOf(day: string): { from: string; to: string } {
  // getUTCDay: Sunday 0 … Saturday 6. Days since the last Saturday:
  const sinceSaturday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 1) % 7;
  const from = addDays(day, -sinceSaturday);
  return { from, to: addDays(from, 6) };
}

function rangeOf(span: Span, anchor: string): { from: string; to: string } {
  if (span === 'week') return weekOf(anchor);
  const month = anchor.slice(0, 7);
  return { from: `${month}-01`, to: lastDayOfMonth(month) };
}

function rangeTitle(span: Span, range: { from: string; to: string }): string {
  return span === 'month' ? monthLabel(range.from.slice(0, 7)) : `${shortDay(range.from)} to ${shortDay(range.to)}`;
}

/** How the days have gone: scores over a week or a month, the weakest items, and streaks. */
export function ProgressView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const dayEndHour = settings?.['habits.dayEndHour'];
  const today = timeZone !== undefined && dayEndHour !== undefined ? habitToday(timeZone, dayEndHour) : null;

  const [span, setSpan] = useState<Span>('week');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [data, setData] = useState<{ key: string; days: DayScore[]; items: ItemStats[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (today && anchor === null) setAnchor(today);
  }, [today, anchor]);

  const range = anchor ? rangeOf(span, anchor) : null;
  // Never ask about days that have not come yet.
  const asked = range && today ? { from: range.from, to: range.to < today ? range.to : today } : null;
  const key = asked ? `${asked.from}:${asked.to}` : '';

  useEffect(() => {
    if (!key) return;
    const [from = '', to = ''] = key.split(':');
    const request = ++latest.current;
    habits
      .stats(from, to)
      .then((loaded) => {
        if (request !== latest.current) return;
        setData({ key, ...loaded });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (request === latest.current) setError(caught instanceof Error ? caught.message : 'Could not load.');
      });
  }, [key]);

  if (!today || !anchor || !range) {
    return <p className="text-sage">Opening your progress…</p>;
  }

  const move = (by: -1 | 1) =>
    setAnchor(span === 'week' ? addDays(range.from, by * 7) : `${addMonths(range.from.slice(0, 7), by)}-01`);
  const ready = data !== null && data.key === key;
  const won = ready ? data.days.filter((day) => day.won === true).length : 0;
  const lost = ready ? data.days.filter((day) => day.won === false).length : 0;
  const weakest = ready ? data.items.filter((item) => item.lost > 0) : [];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-2xl text-ivory md:text-3xl">
          <Reveal key={key}>{rangeTitle(span, range)}</Reveal>
        </h2>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Span" className="mr-2 flex rounded-full border border-hairline p-0.5">
            {(['week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={span === value}
                onClick={() => {
                  setSpan(value);
                  setAnchor(today);
                }}
                className={`min-h-10 rounded-full px-4 text-sm transition-colors duration-200 ${
                  span === value ? 'bg-brass text-ground' : 'text-sage hover:text-ivory'
                }`}
              >
                {value === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => move(-1)}
            className="grid size-11 place-items-center rounded-full text-sage transition-colors duration-150 hover:text-ivory"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next"
            disabled={range.to >= today}
            onClick={() => move(1)}
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

      {!ready ? (
        <p className="text-sage">Adding up the days…</p>
      ) : data.days.length === 0 ? (
        <p className="border-y border-hairline py-10 text-center text-sage">No days to show yet.</p>
      ) : (
        <>
          <section className="mb-12">
            <ScoreChart key={key} days={data.days} />
            <p className="mt-3 text-sm text-sage">
              {won} won, {lost} lost
            </p>
          </section>

          {weakest.length > 0 ? (
            <section className="mb-12">
              <h3 className="mb-2 font-display text-xl text-ivory">Where points are lost</h3>
              <ul aria-label="Weakest items" className="border-t border-hairline">
                {weakest.map((item, index) => (
                  <motion.li
                    key={item.itemId}
                    className="flex items-baseline justify-between gap-4 border-b border-hairline py-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: EASE_OUT, delay: Math.min(index, 10) * 0.04 }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ivory">
                        {item.name}
                        {item.archived ? <span className="ml-2 text-xs text-sage">archived</span> : null}
                      </span>
                      <span className="text-sm text-sage">{missRateText(item.missed, item.applied)}</span>
                    </span>
                    <span className="font-display text-lg text-alert tabular-nums">{pointsText(-item.lost)}</span>
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.items.length > 0 ? (
          <section>
            <h3 className="mb-2 font-display text-xl text-ivory">Streaks</h3>
            <ul aria-label="Streaks" className="border-t border-hairline">
              {[...data.items]
                .sort((a, b) => b.current - a.current || b.best - a.best || a.name.localeCompare(b.name))
                .map((item) => (
                  <li key={item.itemId} className="flex items-baseline justify-between gap-4 border-b border-hairline py-3">
                    <span className="truncate text-ivory">{item.name}</span>
                    <span className={`shrink-0 text-sm ${item.current > 0 ? 'text-brass' : 'text-sage'}`}>
                      {streakText(item.current, item.best)}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
          ) : null}
        </>
      )}
    </>
  );
}
