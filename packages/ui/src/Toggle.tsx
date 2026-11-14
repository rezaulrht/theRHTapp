import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** An on/off switch. Underneath it is a real checkbox, so forms and keyboards treat it as one. */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, id, className, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <div className={cx('flex min-h-11 items-center justify-between gap-4', className)}>
      <label htmlFor={inputId} className="text-base text-ivory">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        role="switch"
        className={cx(
          'relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full border border-hairline bg-ground',
          'transition-colors duration-150 checked:border-brass checked:bg-brass',
          'after:absolute after:left-0.5 after:top-0.5 after:size-[1.375rem] after:rounded-full after:bg-sage',
          'after:transition-transform after:duration-150 checked:after:translate-x-5 checked:after:bg-ground',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...rest}
      />
    </div>
  );
});
