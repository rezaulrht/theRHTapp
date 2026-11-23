'use client';

import { AppNav } from '@pa/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { HabitsIcon, MoneyIcon, SettingsIcon, TodayIcon, VaultIcon } from './icons';
import { PushSync } from './PushSync';
import { SettingsProvider } from './SettingsProvider';
import { SmoothScroll } from './SmoothScroll';

const sections = [
  { href: '/today', label: 'Today', icon: <TodayIcon /> },
  { href: '/money', label: 'Money', icon: <MoneyIcon /> },
  { href: '/habits', label: 'Habits', icon: <HabitsIcon /> },
  { href: '/vault', label: 'Vault', icon: <VaultIcon /> },
  { href: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];

/** Navigation plus the content area, for every page behind the login. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <SettingsProvider>
      <PushSync />
      <SmoothScroll>
        <AppNav items={sections} current={pathname} linkComponent={Link} />
        {/* Leave room for the bottom bar on phones and the side rail on wide screens. */}
        <div className="md:pl-52">
          <main className="mx-auto w-full max-w-3xl px-5 pb-28 pt-8 md:px-8 md:pb-16 md:pt-12 lg:max-w-5xl">
            {children}
          </main>
        </div>
      </SmoothScroll>
    </SettingsProvider>
  );
}
