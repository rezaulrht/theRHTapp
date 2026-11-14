import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` is the brass pill for the main action on a screen, `outline` a
   * quieter bordered button, `quiet` text only.
   */
  variant?: 'primary' | 'outline' | 'quiet';
  /** Shows the button as working and blocks further presses. */
  loading?: boolean;
}

const variants = {
  primary: 'border border-brass text-brass hover:text-ground active:text-ground',
  outline: 'border border-hairline text-ivory hover:border-brass hover:text-ground active:text-ground',
  quiet: 'text-sage hover:text-ivory',
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, disabled, className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'group/button relative isolate inline-flex min-h-11 items-center justify-center overflow-hidden rounded-full px-6 text-sm font-medium',
        // The press: the button gives slightly under the finger.
        'transition-[color,border-color,transform] duration-200 ease-out active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        loading && 'animate-pulse',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {variant === 'quiet' ? null : (
        // Brass that sweeps in from the left on hover and stays while pressed.
        <span
          data-sweep
          aria-hidden="true"
          className={cx(
            'absolute inset-0 -z-10 origin-left scale-x-0 bg-brass transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            'group-hover/button:scale-x-100 group-active/button:scale-x-100 group-disabled/button:scale-x-0',
          )}
        />
      )}
      <span data-label className="inline-flex items-center gap-2">
        {children}
      </span>
    </button>
  );
});
