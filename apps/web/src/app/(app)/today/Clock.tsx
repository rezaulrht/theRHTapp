'use client';

import { useEffect, useState } from 'react';
import { clockParts } from '@/lib/today';

/**
 * Two digits, each in a cell of its own width, so the pair never shifts
 * sideways as the numbers change (this display face has digits of different widths).
 */
function Unit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span data-unit className="flex leading-none">
        {[...value].map((digit, index) => (
          <span key={index} className="inline-block w-[0.62em] text-center">
            {digit}
          </span>
        ))}
      </span>
      <span className="mt-2 font-sans text-xs text-sage">{label}</span>
    </div>
  );
}

function Colon() {
  return (
    <span aria-hidden="true" className="leading-none text-brass">
      :
    </span>
  );
}

/**
 * The time now, in the owner's time zone, as hours, minutes and seconds. It
 * moves on the turn of each second, and stops when it leaves the page. The
 * digits change in place without animating: a movement every second would
 * only tire the eye.
 */
export function Clock({ timeZone }: { timeZone: string }) {
  // Read after mount, so the server and the phone agree on the first paint.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      // Wait for the next whole second, so the display never lags behind it.
      timer = setTimeout(tick, 1000 - current.getMilliseconds());
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  if (now === null) return null;
  const { hours, minutes, seconds, period } = clockParts(now, timeZone);

  return (
    <div
      role="timer"
      aria-label="Current time"
      className="flex items-start gap-1.5 font-display text-3xl text-ivory md:text-4xl"
    >
      <Unit value={hours} label="hr" />
      <Colon />
      <Unit value={minutes} label="min" />
      <Colon />
      <Unit value={seconds} label="sec" />
      <span className="ml-1 pt-[0.35em] font-sans text-sm leading-none text-sage">{period}</span>
    </div>
  );
}
