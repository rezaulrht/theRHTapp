'use client';

import { ReactLenis } from 'lenis/react';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Eased scrolling for mouse wheels and trackpads. Touch scrolling is left to
 * the phone, which already does it well, and it is off entirely when the
 * device asks for reduced motion.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(!query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (!enabled) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.12, syncTouch: false }}>
      {children}
    </ReactLenis>
  );
}
