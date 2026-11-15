'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const views = [
  { href: '/money', label: 'Day' },
  { href: '/money/month', label: 'Month' },
  { href: '/money/loans', label: 'Loans' },
];

/** The three views of Money. The brass line slides under the one that is open. */
export function MoneyNav() {
  const pathname = usePathname();
  const active = Math.max(
    0,
    views.findIndex((view) => (view.href === '/money' ? pathname === '/money' : pathname.startsWith(view.href))),
  );

  return (
    <nav aria-label="Money" className="relative mb-8 inline-grid grid-cols-3 border-b border-hairline">
      {views.map((view, index) => (
        <Link
          key={view.href}
          href={view.href}
          aria-current={index === active ? 'page' : undefined}
          className={`flex min-h-11 items-center justify-center px-5 text-sm transition-colors duration-200 ${
            index === active ? 'text-ivory' : 'text-sage hover:text-ivory'
          }`}
        >
          {view.label}
        </Link>
      ))}
      <span
        aria-hidden="true"
        className="absolute -bottom-px left-0 h-px w-1/3 bg-brass transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${active * 100}%)` }}
      />
    </nav>
  );
}
