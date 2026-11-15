'use client';

import { forwardRef, useEffect, useState, type HTMLAttributes } from 'react';
import { cx } from './cx';

export interface AmountProps extends HTMLAttributes<HTMLSpanElement> {
  value: number;
  /** Symbol shown before the number, such as ৳. */
  currency?: string;
  /** Count up from zero to the value when it appears or changes. */
  animate?: boolean;
}

const COUNT_UP_MS = 600;

export function formatAmount(value: number, currency = ''): string {
  const fraction = Number.isInteger(value) ? 0 : 2;
  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  // The minus goes before the symbol: −৳80, not ৳-80.
  return `${value < 0 ? '−' : ''}${currency}${number}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** A money figure or score in the display face, with digits that line up in columns. */
export const Amount = forwardRef<HTMLSpanElement, AmountProps>(function Amount(
  { value, currency, animate = false, className, ...rest },
  ref,
) {
  const counting = animate && !prefersReducedMotion();
  const [shown, setShown] = useState(counting ? 0 : value);

  useEffect(() => {
    if (!counting) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / COUNT_UP_MS, 1);
      const eased = 1 - (1 - progress) ** 3;
      // Whole steps while moving, the exact value at the end.
      setShown(progress === 1 ? value : Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, counting]);

  return (
    <span
      ref={ref}
      // Screen readers get the real figure, not the numbers flying past.
      aria-label={formatAmount(value, currency)}
      className={cx('font-display tabular-nums', className)}
      {...rest}
    >
      <span aria-hidden="true">{formatAmount(shown, currency)}</span>
    </span>
  );
});
