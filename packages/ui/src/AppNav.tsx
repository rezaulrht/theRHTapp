import {
  forwardRef,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
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
 * left side from 768px up. A brass marker slides to whichever section is
 * current.
 */
export const AppNav = forwardRef<HTMLElement, AppNavProps>(function AppNav(
  { items, current, linkComponent: Link = 'a', className, ...rest },
  ref,
) {
  const activeIndex = items.findIndex((item) => isCurrent(current, item.href));

  return (
    <nav
      ref={ref}
      aria-label="Sections"
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ground/90 backdrop-blur-md',
        'pb-[env(safe-area-inset-bottom)]',
        'md:inset-y-0 md:left-0 md:right-auto md:w-52 md:border-r md:border-t-0 md:pb-0 md:pt-10',
        className,
      )}
      {...rest}
    >
      <ul className="relative flex justify-around md:flex-col md:gap-1 md:px-3">
        {activeIndex >= 0 ? (
          // One element that moves, so the change of section reads as a slide.
          // Phone: a brass line along the top of the bar, one item wide.
          // Wide screens: a tinted block behind the current row (2.75rem tall, 0.25rem apart).
          <li
            data-nav-marker
            aria-hidden="true"
            style={{ '--nav-index': String(activeIndex), '--nav-count': String(items.length) } as CSSProperties}
            className={cx(
              'pointer-events-none absolute left-0 top-0 h-0.5 w-[calc(100%/var(--nav-count))] bg-brass',
              'translate-x-[calc(var(--nav-index)*100%)]',
              'transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
              'md:left-3 md:right-3 md:h-11 md:w-auto md:translate-x-0 md:rounded-[var(--radius-control)]',
              'md:translate-y-[calc(var(--nav-index)*3rem)] md:border-l-2 md:border-brass md:bg-brass/10',
            )}
          />
        ) : null}
        {items.map((item) => {
          const active = isCurrent(current, item.href);
          return (
            <li key={item.href} className="relative flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors duration-300',
                  'active:scale-95 md:active:scale-100',
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
