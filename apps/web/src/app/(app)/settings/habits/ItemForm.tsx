'use client';

import { Button, Field, Select, Toggle } from '@pa/ui';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import { ApiError, type FieldError } from '@/lib/api';
import {
  habits,
  pointsText,
  toPoints,
  type AppliesTo,
  type Channel,
  type HabitItem,
  type HabitItemInput,
  type Prayer,
  type Timing,
} from '@/lib/habits';

/** The owner's week starts on Saturday. Values are Sunday = 0 … Saturday = 6. */
export const WEEK = [
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

export const PRAYER_NAMES: Record<Prayer, string> = {
  fajr: 'Fajr',
  zuhr: 'Zuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

type Kind = Timing['kind'];

interface Draft {
  name: string;
  points: string;
  kind: Kind;
  start: string;
  due: string;
  prayer: Prayer;
  from: string;
  until: string;
  every: string;
  target: string;
  daysKind: AppliesTo['kind'];
  days: number[];
  dayTypeIds: string[];
  lateShare: string;
  missMultiplier: string;
  channels: Channel[];
  onOpen: boolean;
  onDue: boolean;
  warn: boolean;
  ignoreQuietHours: boolean;
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function draftOf(item: HabitItem | null): Draft {
  const timing = item?.timing;
  return {
    name: item?.name ?? '',
    points: item ? pointsText(item.points) : '',
    kind: timing?.kind ?? 'fixed',
    start: timing && timing.kind !== 'repeating' ? (timing.start ?? '') : '',
    due: timing?.kind === 'fixed' ? (timing.due ?? '') : timing?.kind === 'prayer' ? (timing.end ?? '') : '',
    prayer: timing?.kind === 'prayer' ? timing.prayer : 'fajr',
    from: timing?.kind === 'repeating' ? timing.start : '',
    until: timing?.kind === 'repeating' ? timing.end : '',
    every: timing?.kind === 'repeating' ? String(timing.everyMinutes) : '90',
    target: timing?.kind === 'repeating' ? String(timing.target) : '8',
    daysKind: item?.appliesTo.kind ?? 'weekdays',
    days: item?.appliesTo.kind === 'weekdays' ? item.appliesTo.days : ALL_DAYS,
    dayTypeIds: item?.appliesTo.kind === 'dayTypes' ? item.appliesTo.dayTypeIds : [],
    lateShare: item?.lateShare == null ? '' : String(Math.round(item.lateShare * 100)),
    missMultiplier: item?.missMultiplier == null ? '' : String(item.missMultiplier),
    channels: item?.reminders.channels ?? ['push'],
    onOpen: item?.reminders.onOpen ?? true,
    onDue: item?.reminders.onDue ?? true,
    warn: item?.reminders.warn ?? true,
    ignoreQuietHours: item?.ignoreQuietHours ?? false,
  };
}

function timingOf(draft: Draft): Timing {
  const optional = (key: 'start' | 'due' | 'end', value: string) => (value ? { [key]: value } : {});
  if (draft.kind === 'fixed') return { kind: 'fixed', ...optional('start', draft.start), ...optional('due', draft.due) };
  if (draft.kind === 'prayer') {
    return { kind: 'prayer', prayer: draft.prayer, ...optional('start', draft.start), ...optional('end', draft.due) };
  }
  return {
    kind: 'repeating',
    start: draft.from,
    end: draft.until,
    everyMinutes: Number(draft.every),
    target: Number(draft.target),
  };
}

/** Server paths, matched to the field each one belongs beside. */
const FIELD_OF: Record<string, string> = {
  name: 'name',
  points: 'points',
  'timing.start': 'start',
  'timing.due': 'due',
  'timing.end': 'end',
  'timing.prayer': 'prayer',
  'timing.everyMinutes': 'every',
  'timing.target': 'target',
  'appliesTo.days': 'days',
  'appliesTo.dayTypeIds': 'days',
  lateShare: 'lateShare',
  missMultiplier: 'missMultiplier',
};

function CheckList({
  legend,
  options,
  chosen,
  onChange,
  error,
}: {
  legend: string;
  options: { value: string | number; label: string }[];
  chosen: (string | number)[];
  onChange(next: (string | number)[]): void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = chosen.includes(option.value);
          return (
            <label
              key={option.value}
              className={`flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm transition-colors duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brass ${
                on ? 'border-brass bg-brass text-ground' : 'border-hairline text-sage hover:text-ivory'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onChange(on ? chosen.filter((value) => value !== option.value) : [...chosen, option.value])}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error ? <p className="mt-1.5 text-sm text-alert">{error}</p> : null}
    </fieldset>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-hairline pt-5">
      <h3 className="mb-3 text-sm text-sage">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

/** Adding a routine item, or changing one. Sends hundredths of a point. */
export function ItemForm({ item, onSaved, onCancel }: { item: HabitItem | null; onSaved(): void; onCancel(): void }) {
  const { settings } = useSettings();
  const dayTypes = settings?.['general.dayTypes'] ?? [];
  const [draft, setDraft] = useState<Draft>(() => draftOf(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const errorAt = (field: string) => errors[field];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const local: Record<string, string> = {};
    const points = toPoints(draft.points);
    if (!points.ok) local.points = points.message;
    if (!draft.name.trim()) local.name = 'Enter a name';
    const share = draft.lateShare.trim();
    if (share && !(Number(share) >= 0 && Number(share) <= 100)) local.lateShare = 'Use 0 to 100';
    const multiplier = draft.missMultiplier.trim();
    if (multiplier && !(Number(multiplier) >= 0 && Number(multiplier) <= 5)) local.missMultiplier = 'Use a number from 0 to 5';
    if (Object.keys(local).length > 0 || !points.ok) {
      setErrors(local);
      return;
    }

    const body: HabitItemInput = {
      name: draft.name.trim(),
      points: points.points,
      timing: timingOf(draft),
      appliesTo:
        draft.daysKind === 'weekdays'
          ? { kind: 'weekdays', days: [...draft.days].sort() }
          : { kind: 'dayTypes', dayTypeIds: draft.dayTypeIds },
      lateShare: share ? Number(share) / 100 : null,
      missMultiplier: multiplier ? Number(multiplier) : null,
      reminders: { channels: draft.channels, onOpen: draft.onOpen, onDue: draft.onDue, warn: draft.warn },
      ignoreQuietHours: draft.ignoreQuietHours,
    };

    setBusy(true);
    setErrors({});
    setProblem(null);
    try {
      if (item) await habits.updateItem(item.id, body);
      else await habits.createItem(body);
      onSaved();
    } catch (caught) {
      if (caught instanceof ApiError && caught.errors?.length) {
        const placed: Record<string, string> = {};
        const unplaced: FieldError[] = [];
        for (const error of caught.errors) {
          const field = FIELD_OF[error.path];
          if (field && !placed[field]) placed[field] = error.message;
          else if (!field) unplaced.push(error);
        }
        setErrors(placed);
        setProblem(unplaced.map((error) => error.message).join(' ') || null);
      } else {
        setProblem(caught instanceof Error ? caught.message : 'Could not save. Try again.');
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <Field label="Name" autoComplete="off" autoFocus={!item} value={draft.name} onChange={(event) => set('name', event.target.value)} error={errorAt('name')} />
        <Field label="Points" inputMode="decimal" autoComplete="off" value={draft.points} onChange={(event) => set('points', event.target.value)} error={errorAt('points')} />
      </div>

      <Group title="When">
        <Select label="Kind" value={draft.kind} onChange={(event) => set('kind', event.target.value as Kind)}>
          <option value="fixed">At a set time</option>
          <option value="prayer">A prayer</option>
          <option value="repeating">Several times a day</option>
        </Select>

        {draft.kind === 'fixed' ? (
          <div className="grid grid-cols-2 gap-4 [color-scheme:dark]">
            <Field label="Opens at" type="time" value={draft.start} onChange={(event) => set('start', event.target.value)} error={errorAt('start')} hint="Leave empty if any time before is fine." />
            <Field label="Due at" type="time" value={draft.due} onChange={(event) => set('due', event.target.value)} error={errorAt('due')} hint="Leave empty for any time that day." />
          </div>
        ) : null}

        {draft.kind === 'prayer' ? (
          <>
            <Select label="Prayer" value={draft.prayer} onChange={(event) => set('prayer', event.target.value as Prayer)} error={errorAt('prayer')}>
              {(Object.keys(PRAYER_NAMES) as Prayer[]).map((prayer) => (
                <option key={prayer} value={prayer}>
                  {PRAYER_NAMES[prayer]}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4 [color-scheme:dark]">
              <Field label="Not before" type="time" value={draft.start} onChange={(event) => set('start', event.target.value)} error={errorAt('start')} />
              <Field label="Not after" type="time" value={draft.due} onChange={(event) => set('due', event.target.value)} error={errorAt('end')} />
            </div>
            <p className="-mt-2 text-xs text-sage">
              Leave both empty to use the prayer&rsquo;s own time, until the next prayer begins.
            </p>
          </>
        ) : null}

        {draft.kind === 'repeating' ? (
          <div className="grid grid-cols-2 gap-4 [color-scheme:dark]">
            <Field label="From" type="time" value={draft.from} onChange={(event) => set('from', event.target.value)} error={errorAt('start')} />
            <Field label="Until" type="time" value={draft.until} onChange={(event) => set('until', event.target.value)} error={errorAt('end')} />
            <Field label="Every (minutes)" inputMode="numeric" autoComplete="off" value={draft.every} onChange={(event) => set('every', event.target.value.replace(/\D/g, ''))} error={errorAt('every')} />
            <Field label="Times a day" inputMode="numeric" autoComplete="off" value={draft.target} onChange={(event) => set('target', event.target.value.replace(/\D/g, ''))} error={errorAt('target')} />
          </div>
        ) : null}
      </Group>

      <Group title="Days">
        <Select label="Which days" value={draft.daysKind} onChange={(event) => set('daysKind', event.target.value as AppliesTo['kind'])}>
          <option value="weekdays">Days of the week</option>
          <option value="dayTypes">Kinds of day</option>
        </Select>
        {draft.daysKind === 'weekdays' ? (
          <CheckList
            legend="Days of the week"
            options={WEEK.map((day) => ({ value: day.value, label: day.label }))}
            chosen={draft.days}
            onChange={(next) => set('days', next as number[])}
            error={errorAt('days')}
          />
        ) : (
          <CheckList
            legend="Kinds of day"
            options={dayTypes.map((dayType) => ({ value: dayType.id, label: dayType.name }))}
            chosen={draft.dayTypeIds}
            onChange={(next) => set('dayTypeIds', next as string[])}
            error={errorAt('days')}
          />
        )}
      </Group>

      <Group title="Reminders">
        <div className="flex flex-col">
          <Toggle label="Phone notification" checked={draft.channels.includes('push')} onChange={(event) => set('channels', event.target.checked ? [...draft.channels, 'push'] : draft.channels.filter((c) => c !== 'push'))} />
          <Toggle label="Email" checked={draft.channels.includes('email')} onChange={(event) => set('channels', event.target.checked ? [...draft.channels, 'email'] : draft.channels.filter((c) => c !== 'email'))} />
        </div>
        {draft.kind === 'repeating' ? (
          <p className="text-xs text-sage">A nudge comes at each interval until it is done enough times.</p>
        ) : (
          <div className="flex flex-col">
            <Toggle label="When it opens" checked={draft.onOpen} onChange={(event) => set('onOpen', event.target.checked)} />
            <Toggle label="At the due time" checked={draft.onDue} onChange={(event) => set('onDue', event.target.checked)} />
            <Toggle label="A warning before it closes" checked={draft.warn} onChange={(event) => set('warn', event.target.checked)} />
          </div>
        )}
        <Toggle label="Send even during quiet hours" checked={draft.ignoreQuietHours} onChange={(event) => set('ignoreQuietHours', event.target.checked)} />
      </Group>

      <Group title="Scoring for this item only">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Share kept when late (%)" inputMode="numeric" autoComplete="off" placeholder="As set for all" value={draft.lateShare} onChange={(event) => set('lateShare', event.target.value.replace(/[^\d.]/g, ''))} error={errorAt('lateShare')} />
          <Field label="A miss costs (times the points)" inputMode="decimal" autoComplete="off" placeholder="As set for all" value={draft.missMultiplier} onChange={(event) => set('missMultiplier', event.target.value.replace(/[^\d.]/g, ''))} error={errorAt('missMultiplier')} />
        </div>
      </Group>

      {problem ? (
        <p role="alert" className="text-sm text-alert">
          {problem}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={busy} className="flex-1">
          {item ? 'Save changes' : 'Add to routine'}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
