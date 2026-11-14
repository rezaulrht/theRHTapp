import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

export interface AppNavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export interface AppNavProps extends HTMLAttributes<HTMLElement> {
  items: AppNavItem[];
  /** The current path. An item is current on its own page and any page beneath it. */
  current: string;
  /** Link element to render, for example Next.js `Link`. Defaults to a plain anchor. */
  linkComponent?: ElementType;
}

function isCurrent(current: string, href: string): boolean {
  return current === href || current.startsWith(`${href}/`);
}

/**
 * The app's main navigation: a bar along the bottom on phones, a rail down the
 * left side from 768px up.
 */
export const AppNav = forwardRef<HTMLElement, AppNavProps>(function AppNav(
  { items, current, linkComponent: Link = 'a', className, ...rest },
  ref,
) {
  return (
    <nav
      ref={ref}
      aria-label="Sections"
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ground/95 backdrop-blur',
        'pb-[env(safe-area-inset-bottom)]',
        'md:inset-y-0 md:left-0 md:right-auto md:w-52 md:border-r md:border-t-0 md:pb-0 md:pt-10',
        className,
      )}
      {...rest}
    >
      <ul className="flex justify-around md:flex-col md:gap-1 md:px-3">
        {items.map((item) => {
          const active = isCurrent(current, item.href);
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors duration-150',
                  'md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-[var(--radius-control)] md:px-3 md:text-sm',
                  active ? 'text-brass' : 'text-sage hover:text-ivory',
                )}
              >
                <span aria-hidden="true" className="grid size-5 place-items-center">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
