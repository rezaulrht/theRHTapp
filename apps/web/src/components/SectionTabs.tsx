'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SectionTab {
  href: string;
  label: string;
}

/**
 * The views inside a section (Day, Month, Loans). The first tab is the
 * section's own page. The brass line slides under the one that is open.
 */
export function SectionTabs({ label, tabs }: { label: string; tabs: SectionTab[] }) {
  const pathname = usePathname();
  const active = Math.max(
    0,
    tabs.findIndex((tab, index) => (index === 0 ? pathname === tab.href : pathname.startsWith(tab.href))),
  );

  return (
    <nav
      aria-label={label}
      className="relative mb-8 inline-grid border-b border-hairline"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab, index) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={index === active ? 'page' : undefined}
          className={`flex min-h-11 items-center justify-center px-5 text-sm transition-colors duration-200 ${
            index === active ? 'text-ivory' : 'text-sage hover:text-ivory'
          }`}
        >
          {tab.label}
        </Link>
      ))}
      <span
        aria-hidden="true"
        className="absolute -bottom-px left-0 h-px bg-brass transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${100 / tabs.length}%`, transform: `translateX(${active * 100}%)` }}
      />
    </nav>
  );
}
