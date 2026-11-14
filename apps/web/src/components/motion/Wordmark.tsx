'use client';

import { motion } from 'motion/react';
import { EASE_OUT } from './ease';

/**
 * The app's name as a heading whose letters rise one after another, followed
 * by a brass rule that draws across beneath it. Screen readers get the word
 * once; the moving letters are hidden from them.
 */
export function Wordmark({ text, className }: { text: string; className?: string }) {
  const letters = [...text];
  return (
    <h1 aria-label={text} className={className}>
      <span aria-hidden="true" className="-mb-[0.12em] flex overflow-hidden pb-[0.12em]">
        {letters.map((letter, index) => (
          <motion.span
            key={index}
            data-letter
            className="inline-block will-change-transform"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.05 + index * 0.045 }}
          >
            {letter === ' ' ? ' ' : letter}
          </motion.span>
        ))}
      </span>
      <motion.span
        aria-hidden="true"
        className="mt-4 block h-px origin-left bg-brass"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 }}
      />
    </h1>
  );
}
