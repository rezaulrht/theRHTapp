import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown under the input and read out with it. */
  error?: string;
  /** Extra guidance shown under the input when there is no error. */
  hint?: ReactNode;
}

export const controlClass =
  'min-h-11 w-full rounded-[var(--radius-control)] border border-hairline bg-ground px-3.5 text-base text-ivory ' +
  'placeholder:text-sage/60 hover:border-sage aria-[invalid=true]:border-alert';

/** A labelled text input. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, id, className, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm text-sage">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={controlClass}
        {...rest}
      />
      {note ? (
        <p id={noteId} className={cx('text-sm', error ? 'text-alert' : 'text-sage')}>
          {note}
        </p>
      ) : null}
    </div>
  );
});
