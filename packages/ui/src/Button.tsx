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
  primary:
    'border border-brass text-brass hover:bg-brass hover:text-ground active:bg-brass active:text-ground',
  outline: 'border border-hairline text-ivory hover:border-brass',
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
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-medium',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        loading && 'animate-pulse',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
