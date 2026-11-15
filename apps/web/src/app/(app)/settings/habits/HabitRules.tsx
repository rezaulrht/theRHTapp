'use client';

import { PRAYER_METHODS, type PrayerMethod, type Settings } from '@pa/shared';
import { Field, Select, Toggle } from '@pa/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { habits, type PrayerTimes } from '@/lib/habits';
import { habitToday, timeText } from '@/lib/habits-text';
import { channelName } from '../notifications/TestReminder';
import { Section } from '../parts';
import { SaveBar } from '../SaveBar';
import { useSettingsDraft } from '../useSettingsDraft';

const METHOD_NAMES: Record<PrayerMethod, string> = {
  Karachi: 'University of Islamic Sciences, Karachi',
  MuslimWorldLeague: 'Muslim World League',
  Egyptian: 'Egyptian General Authority of Survey',
  UmmAlQura: 'Umm al-Qura, Makkah',
  Dubai: 'Dubai',
  MoonsightingCommittee: 'Moonsighting Committee',
  NorthAmerica: 'Islamic Society of North America',
  Kuwait: 'Kuwait',
  Qatar: 'Qatar',
  Singapore: 'Singapore',
  Tehran: 'Institute of Geophysics, Tehran',
  Turkey: 'Diyanet, Turkey',
};

type NumberKey = 'habits.lateShare' | 'habits.missMultiplier' | 'habits.dailyTargetPercent' | 'habits.warnLeadMinutes';

/**
 * A number box that holds what is typed, so it can be emptied while editing,
 * and puts the number into the draft whenever the text reads as one.
 */
function NumberField({
  label,
  value,
  scale = 1,
  onValue,
  error,
  hint,
}: {
  label: string;
  value: number | undefined;
  /** Shown multiplied by this: a share of 0.5 shown as 50. */
  scale?: number;
  onValue(value: number): void;
  error?: string;
  hint?: string;
}) {
  const shown = (number: number) => String(Math.round(number * scale * 100) / 100);
  const [text, setText] = useState(value === undefined ? '' : shown(value));
  // Filled once, when the settings arrive; after that the box is the owner's.
  const filled = useRef(value !== undefined);
  useEffect(() => {
    if (value !== undefined && !filled.current) {
      filled.current = true;
      setText(shown(value));
    }
  }, [value]);

  return (
    <Field
      label={label}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        const next = event.target.value.replace(/[^\d.]/g, '');
        setText(next);
        if (next !== '' && !Number.isNaN(Number(next))) onValue(Number(next) / scale);
      }}
      error={error}
      hint={hint}
    />
  );
}

function PrayerPreview({ settings }: { settings: Settings }) {
  const [times, setTimes] = useState<PrayerTimes | null>(null);
  const timeZone = settings['general.timezone'];
  const day = habitToday(timeZone, settings['habits.dayEndHour']);
  const key = JSON.stringify([day, settings['habits.prayer'], settings['general.location']]);

  useEffect(() => {
    let current = true;
    habits
      .prayerTimes(day)
      .then((loaded) => {
        if (current) setTimes(loaded);
      })
      .catch(() => {
        if (current) setTimes(null);
      });
    return () => {
      current = false;
    };
  }, [key]);

  if (!times) return null;
  const list: [string, string][] = [
    ['Fajr', times.fajr],
    ['Sunrise', times.sunrise],
    ['Zuhr', times.zuhr],
    ['Asr', times.asr],
    ['Maghrib', times.maghrib],
    ['Isha', times.isha],
  ];
  return (
    <p className="text-sm text-sage">
      Today at {settings['general.location'].label}, as last saved: {list.map(([name, at]) => `${name} ${timeText(at, timeZone)}`).join(' · ')}
    </p>
  );
}

/** How the day is scored, when it ends, and how prayer times are worked out. */
export function HabitRules() {
  const { draft, set, submit, state, errorAt, otherErrors, formError } = useSettingsDraft();
  if (!draft) return null;

  const prayer = draft['habits.prayer'];
  const summary = draft['habits.daySummary'];
  const number = (key: NumberKey) => (value: number) => set(key, value);
  const shown = [
    'habits.lateShare',
    'habits.missMultiplier',
    'habits.dayEndHour',
    'habits.dailyTargetPercent',
    'habits.warnLeadMinutes',
    'habits.prayer.method',
    'habits.prayer.asr',
    'habits.daySummary.time',
  ];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <Section title="Scoring and prayer times">
      <form onSubmit={onSubmit} method="post" noValidate className="flex max-w-xl flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Share kept when late (%)"
            value={draft['habits.lateShare']}
            scale={100}
            onValue={number('habits.lateShare')}
            error={errorAt('habits.lateShare')}
            hint="50 means a 5-point item done late earns 2.5."
          />
          <NumberField
            label="A miss costs (times the points)"
            value={draft['habits.missMultiplier']}
            onValue={number('habits.missMultiplier')}
            error={errorAt('habits.missMultiplier')}
            hint="1.5 means missing a 5-point item costs 7.5."
          />
          <NumberField
            label="Points needed to win the day (%)"
            value={draft['habits.dailyTargetPercent']}
            onValue={number('habits.dailyTargetPercent')}
            error={errorAt('habits.dailyTargetPercent')}
          />
          <NumberField
            label="Warning before something closes (minutes)"
            value={draft['habits.warnLeadMinutes']}
            onValue={number('habits.warnLeadMinutes')}
            error={errorAt('habits.warnLeadMinutes')}
          />
        </div>

        <Select
          label="The habit day ends at"
          value={String(draft['habits.dayEndHour'])}
          onChange={(event) => set('habits.dayEndHour', Number(event.target.value))}
          error={errorAt('habits.dayEndHour')}
        >
          {Array.from({ length: 9 }, (_, hour) => (
            <option key={hour} value={hour}>
              {hour === 0 ? 'Midnight' : `${hour}:00 am`}
            </option>
          ))}
        </Select>
        <p className="-mt-3 text-xs text-sage">Anything done before then still counts for the day before, such as going to bed at 1 am.</p>

        <Select
          label="Prayer time method"
          value={prayer.method}
          onChange={(event) => set('habits.prayer', { ...prayer, method: event.target.value as PrayerMethod })}
          error={errorAt('habits.prayer.method')}
        >
          {PRAYER_METHODS.map((method) => (
            <option key={method} value={method}>
              {METHOD_NAMES[method]}
            </option>
          ))}
        </Select>
        <Select
          label="Asr"
          value={prayer.asr}
          onChange={(event) => set('habits.prayer', { ...prayer, asr: event.target.value as 'hanafi' | 'standard' })}
          error={errorAt('habits.prayer.asr')}
        >
          <option value="hanafi">Hanafi (later)</option>
          <option value="standard">Standard: Shafi&rsquo;i, Maliki, Hanbali (earlier)</option>
        </Select>
        <PrayerPreview settings={draft} />

        <div className="border-t border-hairline pt-5">
          <Toggle
            label="End-of-day summary"
            checked={summary.enabled}
            onChange={(event) => set('habits.daySummary', { ...summary, enabled: event.target.checked })}
          />
          <Field
            className="mt-3 [color-scheme:dark]"
            label="Send it at"
            type="time"
            value={summary.time}
            onChange={(event) => set('habits.daySummary', { ...summary, time: event.target.value || summary.time })}
            error={errorAt('habits.daySummary.time')}
          />
          {(['push', 'email'] as const).map((channel) => (
            <Toggle
              key={channel}
              label={channelName(channel)}
              checked={summary.channels.includes(channel)}
              onChange={(event) =>
                set('habits.daySummary', {
                  ...summary,
                  channels: event.target.checked
                    ? [...summary.channels.filter((item) => item !== channel), channel]
                    : summary.channels.filter((item) => item !== channel),
                })
              }
            />
          ))}
        </div>

        <SaveBar state={state} formError={formError} otherErrors={otherErrors(shown)} />
      </form>
    </Section>
  );
}
