import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from './cx';

/** A raised surface that groups related content. */
export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Panel(
  { className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('rounded-[var(--radius-panel)] bg-panel p-5 md:p-6', className)}
      {...rest}
    />
  );
});
