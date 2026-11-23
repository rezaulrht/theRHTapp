'use client';

import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/motion/ease';

export interface Bar {
  key: string;
  /** The short text under the bar. */
  label: string;
  value: number;
  /** The bar read aloud, for example "Saturday: ৳120". */
  ariaLabel: string;
  /** Picked out in brass; the rest are muted. */
  highlight?: boolean;
}

/**
 * Plain vertical bars, one per period, drawn with no chart library. Heights
 * share one scale, so a bar is only tall when its value is large next to the
 * others. A zero still shows as a thin line, so the day is visibly there.
 */
export function BarChart({ bars, height = 72, label }: { bars: Bar[]; height?: number; label: string }) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);

  return (
    <ul aria-label={label} className="flex gap-1.5">
      {bars.map((bar, index) => {
        const share = max > 0 ? bar.value / max : 0;
        return (
          <li key={bar.key} aria-label={bar.ariaLabel} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-end border-b border-hairline" style={{ height }}>
              <motion.span
                aria-hidden="true"
                className={`block w-full origin-bottom rounded-t-sm ${bar.highlight ? 'bg-brass' : 'bg-sage/50'}`}
                style={{ height: `${Math.max(share * 100, bar.value > 0 ? 4 : 1.5)}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.7, ease: EASE_OUT, delay: Math.min(index, 20) * 0.04 }}
              />
            </div>
            <span aria-hidden="true" className={`text-xs ${bar.highlight ? 'text-brass' : 'text-sage'}`}>
              {bar.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
