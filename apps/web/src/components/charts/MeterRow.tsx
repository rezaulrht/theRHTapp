'use client';

import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/motion/ease';

/** One horizontal measure: a name, what it comes to in words, and a bar for its share of `max`. */
export function MeterRow({ name, text, value, max }: { name: string; text: string; value: number; max: number }) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <li className="text-sm">
      <div className="flex justify-between gap-4">
        <span className="truncate text-ivory">{name}</span>
        <span className="shrink-0 tabular-nums text-sage">{text}</span>
      </div>
      <div
        role="meter"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={text}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline"
      >
        <motion.div
          className="h-full origin-left rounded-full bg-brass"
          style={{ width: '100%' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ duration: 0.8, ease: EASE_OUT }}
        />
      </div>
    </li>
  );
}
