'use client';

import { Amount } from '@pa/ui';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/motion/ease';
import { fromPoints, pointsText, type DayReport } from '@/lib/habits';
import { dayResultText, nextText } from '@/lib/habits-text';

/** The day's score: the number, and a bar that fills towards what is possible with the target marked on it. */
export function ScoreHeader({ report, timeZone }: { report: DayReport; timeZone: string }) {
  const share = report.possible > 0 ? Math.min(Math.max(report.score / report.possible, 0), 1) : 0;
  const targetShare = report.possible > 0 ? Math.min(report.target / report.possible, 1) : 0;
  const result = dayResultText(report);
  const lost = report.won === false && report.closed;
  const next = report.skipped ? '' : nextText(report.next, timeZone);

  return (
    <section aria-label="Score" className="rounded-[var(--radius-panel)] border border-hairline p-5 md:p-6">
      <p className="text-sm text-sage">Score</p>
      <p className="mt-1 flex items-baseline gap-2">
        <Amount value={fromPoints(report.score)} plain animate className="text-5xl leading-none text-ivory md:text-6xl" />
        <span className="text-sage">of {pointsText(report.possible)}</span>
      </p>

      {report.possible > 0 ? (
        <>
          <div aria-hidden="true" className="relative mt-5 h-2 rounded-full bg-hairline">
            <motion.div
              className={`h-full origin-left rounded-full ${lost ? 'bg-alert' : 'bg-brass'}`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: share }}
              transition={{ duration: 1.1, ease: EASE_OUT }}
            />
            <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-ivory" style={{ left: `${targetShare * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-sage">Target {pointsText(report.target)}</p>
        </>
      ) : null}

      {result ? <p className={`mt-4 text-sm ${lost ? 'text-alert' : 'text-brass'}`}>{result}</p> : null}
      {next ? <p className="mt-1 text-sm text-ivory">{next}</p> : null}
    </section>
  );
}
