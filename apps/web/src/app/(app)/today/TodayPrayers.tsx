'use client';

import { useEffect, useState } from 'react';
import { SpotlightPanel } from '@/components/motion/SpotlightPanel';
import { useSettings } from '@/components/SettingsProvider';
import { habits, type PrayerTimes } from '@/lib/habits';
import { timeText } from '@/lib/habits-text';
import { addDays, todayInZone } from '@/lib/money-text';
import { PRAYER_ORDER, prayerStanding, untilText, type PrayerName } from '@/lib/today';

const NAMES: Record<PrayerName, string> = {
  fajr: 'Fajr',
  zuhr: 'Zuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

/** The five prayers for today at the saved location, with the one running now and the time to the next. */
export function TodayPrayers() {
  const { settings } = useSettings();
  const [times, setTimes] = useState<PrayerTimes | null>(null);
  const [tomorrowFajr, setTomorrowFajr] = useState<string | undefined>(undefined);
  const [now, setNow] = useState<Date | null>(null);

  const timeZone = settings?.['general.timezone'];
  const location = settings?.['general.location'];
  const prayerRule = settings?.['habits.prayer'];
  // The calendar day is part of the key, so the list reloads when midnight passes with the page open.
  const day = timeZone && now ? todayInZone(timeZone, now) : null;
  const key = JSON.stringify([day, timeZone, location, prayerRule]);

  useEffect(() => {
    if (!timeZone || !day) return;
    let current = true;
    Promise.all([habits.prayerTimes(day), habits.prayerTimes(addDays(day, 1))])
      .then(([today, tomorrow]) => {
        if (!current) return;
        setTimes(today);
        setTomorrowFajr(tomorrow.fajr);
      })
      .catch(() => {
        if (current) setTimes(null);
      });
    return () => {
      current = false;
    };
  }, [key]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(timer);
  }, []);

  // Nothing is shown until there is something true to show; a failed load leaves no empty frame.
  if (!times || !now || !timeZone || !location) return null;

  const standing = prayerStanding(times, now, tomorrowFajr);
  const nextName =
    standing.next === 'tomorrow-fajr' ? 'Fajr' : standing.next ? NAMES[standing.next] : null;

  return (
    <SpotlightPanel className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-2xl text-ivory">Prayer times</h2>
        <p className="text-sm text-sage">
          {location.label}
          {nextName && standing.untilNextMs !== null ? (
            <>
              {' · '}
              <span className="text-brass">
                {nextName} in {untilText(standing.untilNextMs)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <ul className="mt-5 grid grid-cols-5 gap-2 border-t border-hairline pt-4 text-center">
        {PRAYER_ORDER.map((name) => {
          const running = standing.current === name;
          return (
            <li
              key={name}
              aria-current={running ? 'true' : undefined}
              className={`rounded-xl px-1 py-2 ${running ? 'bg-brass/10 ring-1 ring-brass' : ''}`}
            >
              <p className={`text-xs sm:text-sm ${running ? 'text-brass' : 'text-sage'}`}>{NAMES[name]}</p>
              <p className="mt-1 text-sm tabular-nums text-ivory sm:text-base">{timeText(times[name], timeZone)}</p>
            </li>
          );
        })}
      </ul>
    </SpotlightPanel>
  );
}
