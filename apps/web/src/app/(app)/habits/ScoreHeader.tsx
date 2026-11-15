'use client';

import { Amount } from '@pa/ui';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/motion/ease';
import { fromPoints, pointsText, type DayReport } from '@/lib/habits';
import { dayResultText, nextText } from '@/lib/habits-text';

const SIZE = 132;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const ROUND = 2 * Math.PI * RADIUS;

/** The day's score: a ring that fills towards what is possible, with the target marked on it. */
export function ScoreHeader({ report, timeZone }: { report: DayReport; timeZone: string }) {
  const share = report.possible > 0 ? Math.min(Math.max(report.score / report.possible, 0), 1) : 0;
  const targetShare = report.possible > 0 ? report.target / report.possible : 0;
  const result = dayResultText(report);
  const next = report.skipped ? '' : nextText(report.next, timeZone);
  // The target tick sits on the ring, measured from the top, clockwise.
  const angle = targetShare * 2 * Math.PI - Math.PI / 2;
  const tick = {
    x1: SIZE / 2 + (RADIUS - STROKE) * Math.cos(angle),
    y1: SIZE / 2 + (RADIUS - STROKE) * Math.sin(angle),
    x2: SIZE / 2 + (RADIUS + STROKE / 2) * Math.cos(angle),
    y2: SIZE / 2 + (RADIUS + STROKE / 2) * Math.sin(angle),
  };

  return (
    <div className="flex items-center gap-6">
      <svg aria-hidden="true" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-hairline)" strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={report.won === false && report.closed ? 'var(--color-alert)' : 'var(--color-brass)'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={ROUND}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          initial={{ strokeDashoffset: ROUND }}
          animate={{ strokeDashoffset: ROUND * (1 - share) }}
          transition={{ duration: 1.1, ease: EASE_OUT }}
        />
        {report.possible > 0 ? <line {...tick} stroke="var(--color-ivory)" strokeWidth={1.5} /> : null}
      </svg>

      <div className="min-w-0">
        <p className="text-sm text-sage">Score</p>
        <p className="flex items-baseline gap-2">
          <Amount value={fromPoints(report.score)} plain animate
            className="text-6xl leading-none text-ivory md:text-7xl"
          />
          <span className="text-sage">of {pointsText(report.possible)}</span>
        </p>
        {result ? (
          <p className={`mt-2 text-sm ${report.won === false && report.closed ? 'text-alert' : 'text-brass'}`}>{result}</p>
        ) : null}
        {next ? <p className="mt-1 text-sm text-sage">{next}</p> : null}
      </div>
    </div>
  );
}
