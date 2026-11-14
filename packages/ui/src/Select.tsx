import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cx } from './cx';
import { controlClass } from './Field';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

/** A labelled drop-down. Pass `<option>` elements as children. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, className, children, ...rest },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  const errorId = `${selectId}-error`;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className="text-sm text-sage">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={controlClass}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} className="text-sm text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});
