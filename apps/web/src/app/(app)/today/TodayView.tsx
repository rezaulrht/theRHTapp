'use client';

import { useEffect, useState } from 'react';
import { InstallGuide } from '@/components/InstallGuide';
import { Reveal } from '@/components/motion/Reveal';
import { FadeUp, Stagger, StaggerItem } from '@/components/motion/Stagger';
import { useSettings } from '@/components/SettingsProvider';
import { greetingFor, longDate } from '@/lib/today';
import { TodayHabits } from './TodayHabits';
import { TodayMoney } from './TodayMoney';
import { TodayVault } from './TodayVault';

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
            <h1 className="font-display text-4xl leading-tight text-ivory md:text-5xl">
              <Reveal>{greetingFor(now, timeZone)}</Reveal>
            </h1>
            <FadeUp delay={0.18}>
              <p className="mt-2 text-sage">{longDate(now, timeZone)}</p>
            </FadeUp>
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
        <StaggerItem className="h-full">
          <TodayHabits />
        </StaggerItem>
        <StaggerItem className="h-full">
          <TodayVault />
        </StaggerItem>
      </Stagger>
    </>
  );
}
