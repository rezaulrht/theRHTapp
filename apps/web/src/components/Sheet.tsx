'use client';

import { motion } from 'motion/react';
import { useEffect, useId, type ReactNode } from 'react';
import { EASE_OUT } from './motion/ease';

/**
 * A panel that slides up from the bottom on a phone and appears in the middle
 * on a wide screen, over a dimmed page. Escape or a tap outside closes it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Lets the sheet scroll on its own instead of the smooth-scrolled page behind it.
        data-lenis-prevent
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-hairline bg-panel p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:rounded-[1.75rem]"
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <h2 id={titleId} className="mb-6 font-display text-3xl leading-tight text-ivory">
          {title}
        </h2>
        {children}
      </motion.div>
    </div>
  );
}
