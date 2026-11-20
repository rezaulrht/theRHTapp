'use client';

import { motion } from 'motion/react';
import { EASE_OUT } from './ease';

/**
 * The app's name as a heading whose letters rise one after another, followed
 * by a brass rule that draws across beneath it. Screen readers get the word
 * once; the moving letters are hidden from them. Letters stay together inside
 * their word, and a long name wraps between words instead of running past the
 * edge and being cut off.
 */
export function Wordmark({ text, className }: { text: string; className?: string }) {
  const words = text.split(' ').filter(Boolean);
  let position = 0;
  return (
    <h1 aria-label={text} className={className}>
      <span aria-hidden="true" className="-mb-[0.12em] flex flex-wrap gap-x-[0.3em] overflow-hidden pb-[0.12em]">
        {words.map((word, wordIndex) => (
          <span key={wordIndex} className="flex">
            {[...word].map((letter, letterIndex) => {
              const delay = 0.05 + position * 0.045;
              position += 1;
              return (
                <motion.span
                  key={letterIndex}
                  data-letter
                  className="inline-block will-change-transform"
                  initial={{ y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.7, ease: EASE_OUT, delay }}
                >
                  {letter}
                </motion.span>
              );
            })}
          </span>
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
