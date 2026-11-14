'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT } from './ease';

/** A group whose `StaggerItem` children arrive one after another. */
export function Stagger({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Seconds before the first item starts. */
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.08, delayChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** A single block that fades up into place. */
export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
