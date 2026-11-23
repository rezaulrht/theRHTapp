'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { EASE_OUT } from '@/components/motion/ease';
import type { DayScore } from '@/lib/habits';
import { dayScoreText } from '@/lib/habits-text';

const HEIGHT = 160;

/**
 * One bar per day, its height the share of possible points scored. Brass for
 * a day won, coral for a day lost, an outline for a skipped day. The line
 * across each bar is that day's target. Each bar opens its day.
 */
export function ScoreChart({ days, height = HEIGHT }: { days: DayScore[]; height?: number }) {
  return (
    <ul
      aria-label="Daily scores"
      className="flex items-end gap-1.5 border-b border-hairline"
      style={{ height }}
      data-lenis-prevent
    >
      {days.map((day, index) => {
        const share = day.possible > 0 ? Math.min(Math.max(day.score / day.possible, 0), 1) : 0;
        const target = day.possible > 0 ? day.target / day.possible : 0;
        const fill = day.skipped ? 'transparent' : day.won === false ? 'var(--color-alert)' : 'var(--color-brass)';
        return (
          <li key={day.day} className="flex h-full min-w-0 flex-1">
            <Link
              href={`/habits?day=${day.day}`}
              aria-label={dayScoreText(day)}
              className="group relative flex h-full w-full items-end rounded-t-sm transition-colors duration-150 hover:bg-ivory/[0.04]"
            >
              {day.skipped ? (
                <span aria-hidden="true" className="h-3 w-full rounded-t-sm border border-b-0 border-sage/60" />
              ) : (
                <motion.span
                  aria-hidden="true"
                  className="block w-full origin-bottom rounded-t-sm"
                  // A day with a score at or below zero still shows as a sliver, so it is visibly there.
                  style={{ height: `${Math.max(share * 100, 2)}%`, background: fill }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.7, ease: EASE_OUT, delay: Math.min(index, 30) * 0.025 }}
                />
              )}
              {target > 0 ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 h-px bg-ivory/60"
                  style={{ bottom: `${target * 100}%` }}
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
