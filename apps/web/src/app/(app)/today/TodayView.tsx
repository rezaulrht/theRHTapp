'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { InstallGuide } from '@/components/InstallGuide';
import { Reveal } from '@/components/motion/Reveal';
import { SpotlightPanel } from '@/components/motion/SpotlightPanel';
import { FadeUp, Stagger, StaggerItem } from '@/components/motion/Stagger';
import { useSettings } from '@/components/SettingsProvider';
import { greetingFor, longDate } from '@/lib/today';
import { TodayMoney } from './TodayMoney';

const blocks = [
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
      {/* Height is reserved so nothing below jumps when the greeting arrives. */}
      <header className="mb-10 min-h-[6.5rem]">
        {ready ? (
          <>
            <FadeUp>
              <p className="text-sage">{longDate(now, timeZone)}</p>
            </FadeUp>
            <h1 className="mt-1 font-display text-4xl leading-tight text-ivory md:text-5xl">
              <Reveal delay={0.08}>{greetingFor(now, timeZone)}</Reveal>
            </h1>
          </>
        ) : null}
      </header>

      <InstallGuide />

      {loadError ? (
        <p role="alert" className="mb-6 text-alert">
          {loadError}
        </p>
      ) : null}

      <Stagger delay={0.2} className="grid gap-4 lg:grid-cols-3">
        <StaggerItem className="h-full">
          <TodayMoney />
        </StaggerItem>
        {blocks.map((block) => (
          <StaggerItem key={block.href} className="h-full">
            <Link href={block.href} className="block h-full rounded-[var(--radius-panel)]">
              <SpotlightPanel className="h-full">
                <h2 className="font-display text-2xl text-ivory">{block.title}</h2>
                <p className="mt-2 text-sage">{block.text}</p>
                <p className="mt-6 text-sm text-brass">Not built yet</p>
              </SpotlightPanel>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </>
  );
}
