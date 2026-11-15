'use client';

import { Amount } from '@pa/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SpotlightPanel } from '@/components/motion/SpotlightPanel';
import { useSettings } from '@/components/SettingsProvider';
import { fromPoints, habits, pointsText, type TodayHabitsReport } from '@/lib/habits';
import { dayResultText, nextText } from '@/lib/habits-text';

/** Habits' block on the Today page: the score so far and the next thing on the routine. */
export function TodayHabits() {
  const { settings } = useSettings();
  const [report, setReport] = useState<TodayHabitsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    habits
      .today()
      .then(setReport)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'));
  }, []);

  const timeZone = settings?.['general.timezone'];
  const result = report ? dayResultText({ ...report, closed: false }) : '';
  const next = report && timeZone && !report.skipped ? nextText(report.next, timeZone) : '';

  return (
    <SpotlightPanel className="flex h-full flex-col">
      <h2 className="font-display text-2xl text-ivory">
        <Link href="/habits" className="hover:text-brass">
          Habits
        </Link>
      </h2>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {report ? (
        report.total === 0 && !report.skipped ? (
          <p className="mt-4 text-sm text-sage">Nothing on the routine today.</p>
        ) : (
          <>
            <p className="mt-4 text-sm text-sage">Score so far</p>
            <p className="mt-2 flex items-baseline gap-2">
              <Amount value={fromPoints(report.score)} plain animate className="text-5xl leading-none text-ivory" />
              <span className="text-sm text-sage">of {pointsText(report.possible)}</span>
            </p>
            {result ? <p className="mt-2 text-sm text-brass">{result}</p> : null}

            <ul className="mt-5 flex flex-col gap-1.5 border-t border-hairline pt-4 text-sm">
              <li className="flex justify-between gap-4">
                <span className="text-sage">Done</span>
                <span className="tabular-nums text-ivory">
                  {report.done} of {report.total}
                </span>
              </li>
              {next ? <li className="text-sage">{next}</li> : null}
            </ul>

            <Link
              href="/habits"
              className="mt-6 inline-flex min-h-11 items-center justify-center self-start rounded-full border border-brass px-6 text-sm font-medium text-brass transition-colors duration-200 hover:bg-brass hover:text-ground"
            >
              Open routine
            </Link>
          </>
        )
      ) : error ? null : (
        <p className="mt-4 text-sm text-sage">Adding up today…</p>
      )}
    </SpotlightPanel>
  );
}
