'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { settingsSections } from './sections';

/** Links between the settings pages. On a narrow phone they wrap onto a second line, so none are hidden. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="mb-8">
      <ul className="flex flex-wrap gap-x-1 border-b border-hairline">
        {settingsSections.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors duration-150 ${
                  active ? 'border-brass text-brass' : 'border-transparent text-sage hover:text-ivory'
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
