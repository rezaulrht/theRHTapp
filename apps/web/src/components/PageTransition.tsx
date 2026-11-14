'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT } from './motion/ease';

/**
 * The page change: content fades in while each page's heading rises on its own
 * (see `Reveal`), so the title leads and the rest follows. Movement is dropped
 * automatically when the device asks for reduced motion.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
