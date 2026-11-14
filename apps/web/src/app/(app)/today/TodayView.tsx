'use client';

import { Panel } from '@pa/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import { greetingFor, longDate } from '@/lib/today';

const blocks = [
  {
    href: '/money',
    title: 'Money',
    text: 'What you spent today, your balances, and one tap to add an expense.',
  },
  {
    href: '/habits',
    title: 'Habits',
    text: 'Your score so far and the next thing on your routine.',
  },
  {
    href: '/vault',
    title: 'Vault',
    text: 'Pinned folders and the reminders coming up.',
  },
];

export function TodayView() {
  const { settings, loadError } = useSettings();
  // The clock is read after mount so the server and the phone agree on the first paint.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const timeZone = settings?.['general.timezone'];
  const ready = now !== null && timeZone !== undefined;

  return (
    <>
      <header className="mb-10 min-h-[6.5rem]">
        <p className="text-sage">{ready ? longDate(now, timeZone) : ' '}</p>
        <h1 className="mt-1 font-display text-4xl leading-tight text-ivory md:text-5xl">
          {ready ? greetingFor(now, timeZone) : ' '}
        </h1>
      </header>

      {loadError ? (
        <p role="alert" className="mb-6 text-alert">
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {blocks.map((block) => (
          <Link key={block.href} href={block.href} className="group rounded-[var(--radius-panel)]">
            <Panel className="h-full border border-transparent transition-colors duration-150 group-hover:border-hairline">
              <h2 className="font-display text-2xl text-ivory">{block.title}</h2>
              <p className="mt-2 text-sage">{block.text}</p>
              <p className="mt-6 text-sm text-brass">Not built yet</p>
            </Panel>
          </Link>
        ))}
      </div>
    </>
  );
}
