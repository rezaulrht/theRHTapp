'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { Reveal } from '@/components/motion/Reveal';
import { useSettings } from '@/components/SettingsProvider';
import { timeText } from '@/lib/habits-text';
import { addDays, addMonths, dayLabel, lastDayOfMonth, monthLabel, todayInZone } from '@/lib/money-text';
import { vault, type CalendarEntry } from '@/lib/vault';

const WEEK = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const KIND_COLOR: Record<CalendarEntry['kind'], string> = {
  reminder: 'var(--color-brass)',
  todo: 'var(--color-sage)',
  field: 'var(--color-alert)',
};
const KIND_TEXT: Record<CalendarEntry['kind'], string> = { reminder: 'Reminder', todo: 'To do', field: 'Date' };

/** The days shown for a month: whole weeks, Saturday to Friday. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  // getUTCDay: Sunday 0 … Saturday 6. Days back to the Saturday before:
  const back = (new Date(`${first}T00:00:00Z`).getUTCDay() + 1) % 7;
  const start = addDays(first, -back);
  const last = lastDayOfMonth(month);
  const days: string[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Every Vault reminder, to-do due date and date field, by month. */
export function CalendarView() {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'];
  const today = timeZone ? todayInZone(timeZone) : null;
  const [month, setMonth] = useState<string | null>(null);
  const [entries, setEntries] = useState<{ month: string; list: CalendarEntry[] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (today && month === null) setMonth(today.slice(0, 7));
  }, [today, month]);

  useEffect(() => {
    if (!month) return;
    const days = monthGrid(month);
    const request = ++latest.current;
    vault
      .calendar(days[0]!, days[days.length - 1]!)
      .then((list) => {
        if (request !== latest.current) return;
        setEntries({ month, list });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (request === latest.current) setError(caught instanceof Error ? caught.message : 'Could not load.');
      });
  }, [month]);

  if (!month || !today || !timeZone) return <p className="text-sage">Opening the calendar…</p>;

  const days = monthGrid(month);
  const ready = entries !== null && entries.month === month;
  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of ready ? entries.list : []) byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), entry]);
  const listed = ready
    ? entries.list.filter((entry) => (picked ? entry.date === picked : entry.date.startsWith(month)))
    : [];
  const groups = [...new Set(listed.map((entry) => entry.date))];

  const move = (by: number) => {
    setPicked(null);
    setMonth(addMonths(month, by));
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl leading-tight text-ivory md:text-5xl">
          <Reveal key={month}>{monthLabel(month)}</Reveal>
        </h1>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous month" onClick={() => move(-1)} className="grid size-11 place-items-center rounded-full text-sage hover:text-ivory">
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setPicked(null);
              setMonth(today.slice(0, 7));
            }}
            className="min-h-11 rounded-full px-3 text-sm text-sage hover:text-ivory"
          >
            This month
          </button>
          <button type="button" aria-label="Next month" onClick={() => move(1)} className="grid size-11 place-items-center rounded-full text-sage hover:text-ivory">
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="mb-4 text-alert">
          {error}
        </p>
      ) : null}

      <div role="grid" aria-label={monthLabel(month)} className="mb-8 grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-hairline">
        <div role="row" className="contents">
          {WEEK.map((name) => (
            <div key={name} role="columnheader" className="bg-ground py-2 text-center text-xs text-sage">
              {name}
            </div>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, row) => (
          <div key={row} role="row" className="contents">
            {days.slice(row * 7, row * 7 + 7).map((day, column) => {
              const here = byDay.get(day) ?? [];
              const outside = !day.startsWith(month);
              const label = `${dayLabel(day)}${here.length ? `, ${here.length} ${here.length === 1 ? 'entry' : 'entries'}` : ''}`;
              return (
                <motion.button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-label={label}
                  aria-selected={picked === day}
                  onClick={() => setPicked(picked === day ? null : day)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, ease: EASE_OUT, delay: (row * 7 + column) * 0.006 }}
                  className={`flex min-h-16 flex-col items-start gap-1 bg-ground p-1.5 text-left transition-colors duration-150 hover:bg-panel sm:min-h-20 sm:p-2 ${
                    picked === day ? 'bg-panel ring-1 ring-inset ring-brass' : ''
                  } ${outside ? 'opacity-40' : ''}`}
                >
                  <span
                    className={`grid size-6 place-items-center rounded-full text-xs tabular-nums ${day === today ? 'bg-brass text-ground' : 'text-ivory'}`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {here.slice(0, 4).map((entry, index) => (
                      <span key={index} aria-hidden="true" className="size-1.5 rounded-full" style={{ background: KIND_COLOR[entry.kind], opacity: entry.done ? 0.4 : 1 }} />
                    ))}
                  </span>
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>

      <section aria-labelledby="calendar-list-heading">
        <h2 id="calendar-list-heading" className="mb-3 font-display text-xl text-ivory">
          {picked ? dayLabel(picked) : 'This month'}
        </h2>
        {!ready ? (
          <p className="text-sage">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="border-y border-hairline py-8 text-center text-sage">{picked ? 'Nothing on this day.' : 'Nothing this month.'}</p>
        ) : (
          <ul aria-label="Entries" className="border-t border-hairline">
            {groups.map((day) => (
              <li key={day} className="border-b border-hairline py-3">
                {picked ? null : <p className="mb-1 text-sm text-sage">{dayLabel(day)}</p>}
                <ul className="flex flex-col gap-1">
                  {listed
                    .filter((entry) => entry.date === day)
                    .map((entry, index) => (
                      <li key={`${entry.kind}:${entry.title}:${index}`}>
                        <Link href={entry.link} className="group flex items-center gap-3 py-1">
                          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[entry.kind] }} />
                          <span className={`min-w-0 flex-1 truncate group-hover:text-brass ${entry.done ? 'text-sage line-through' : 'text-ivory'}`}>{entry.title}</span>
                          <span className="shrink-0 text-sm text-sage">
                            {entry.at ? timeText(entry.at, timeZone) : KIND_TEXT[entry.kind]}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
