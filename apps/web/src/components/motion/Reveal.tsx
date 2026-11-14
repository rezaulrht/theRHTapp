'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT } from './ease';

/**
 * Text that rises into place from behind a mask, the way a headline is set on
 * a title card. Wrap one line of text; put it inside the heading element.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Seconds to wait before rising. */
  delay?: number;
  className?: string;
}) {
  return (
    // The padding and negative margin stop descenders (g, y) being clipped by the mask.
    <span className={`-mb-[0.12em] block overflow-hidden pb-[0.12em] ${className ?? ''}`}>
      <motion.span
        className="block will-change-transform"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: EASE_OUT, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}
