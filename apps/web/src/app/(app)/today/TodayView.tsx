'use client';

import { useEffect, useState } from 'react';
import { AskBox } from '@/components/AskBox';
import { InstallGuide } from '@/components/InstallGuide';
import { Reveal } from '@/components/motion/Reveal';
import { FadeUp, Stagger, StaggerItem } from '@/components/motion/Stagger';
import { useSettings } from '@/components/SettingsProvider';
import { longDate } from '@/lib/today';
import { Clock } from './Clock';
import { TodayHabits } from './TodayHabits';
import { TodayMoney } from './TodayMoney';
import { TodayPrayers } from './TodayPrayers';
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
      {/* Height is reserved so nothing below jumps when the date arrives. */}
      <header className="mb-10 min-h-[11rem] md:flex md:min-h-[4.5rem] md:items-end md:justify-between md:gap-8">
        {ready ? (
          <>
            <h1 className="font-display text-4xl leading-tight text-ivory md:text-5xl">
              <Reveal>{longDate(now, timeZone)}</Reveal>
            </h1>
            <FadeUp delay={0.2} className="mt-5 md:mt-0">
              <Clock timeZone={timeZone} />
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

      <AskBox />

      <TodayPrayers />

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
