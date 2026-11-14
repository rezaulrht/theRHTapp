'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * App-wide motion settings. `reducedMotion="user"` makes every animation
 * below honour the device's "reduce motion" setting: movement is dropped and
 * things simply appear.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
