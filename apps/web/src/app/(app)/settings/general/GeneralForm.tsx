'use client';

import type { Settings } from '@pa/shared';
import { Button, Field, Select } from '@pa/ui';
import { useMemo, type FormEvent } from 'react';
import { SaveBar, SectionHeading } from '../SaveBar';
import { useSettingsDraft } from '../useSettingsDraft';

type WeekDay = keyof Settings['general.weekPattern'];

// The owner's week starts on Saturday.
const WEEK: { key: WeekDay; label: string }[] = [
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
];

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

export function GeneralForm() {
  const { draft, set, submit, state, errorAt, otherErrors, formError, loadError } = useSettingsDraft();
  const zones = useMemo(timeZones, []);

  if (loadError) {
    return (
      <p role="alert" className="text-alert">
        {loadError}
      </p>
    );
  }
  if (!draft) return <p className="text-sage">Loading your settings…</p>;

  const location = draft['general.location'];
  const currency = draft['general.currency'];
  const dayTypes = draft['general.dayTypes'];
  const week = draft['general.weekPattern'];

  const setDayTypes = (next: Settings['general.dayTypes']) => set('general.dayTypes', next);

  // Every path this form puts a message beside; anything else goes under the button.
  const shown = [
    'general.timezone',
    'general.location.label',
    'general.location.lat',
    'general.location.lng',
    'general.currency.symbol',
    'general.currency.code',
    'general.dayTypes',
    ...dayTypes.map((_, index) => `general.dayTypes.${index}.name`),
    ...WEEK.map((day) => `general.weekPattern.${day.key}`),
  ];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate>
      <SectionHeading>Time and place</SectionHeading>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Time zone"
          list="time-zones"
          autoComplete="off"
          value={draft['general.timezone']}
          onChange={(event) => set('general.timezone', event.target.value)}
          error={errorAt('general.timezone')}
          hint="Reminders and dates follow this zone."
        />
        <datalist id="time-zones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <Field
          label="Place"
          value={location.label}
          onChange={(event) => set('general.location', { ...location, label: event.target.value })}
          error={errorAt('general.location.label')}
          hint="Used to work out prayer times."
        />
        <Field
          label="Latitude"
          type="number"
          step="any"
          inputMode="decimal"
          value={Number.isFinite(location.lat) ? location.lat : ''}
          onChange={(event) => set('general.location', { ...location, lat: event.target.valueAsNumber })}
          error={errorAt('general.location.lat')}
        />
        <Field
          label="Longitude"
          type="number"
          step="any"
          inputMode="decimal"
          value={Number.isFinite(location.lng) ? location.lng : ''}
          onChange={(event) => set('general.location', { ...location, lng: event.target.valueAsNumber })}
          error={errorAt('general.location.lng')}
        />
      </div>

      <SectionHeading>Currency</SectionHeading>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Currency symbol"
          value={currency.symbol}
          onChange={(event) => set('general.currency', { ...currency, symbol: event.target.value })}
          error={errorAt('general.currency.symbol')}
        />
        <Field
          label="Currency code"
          value={currency.code}
          onChange={(event) => set('general.currency', { ...currency, code: event.target.value })}
          error={errorAt('general.currency.code')}
        />
      </div>

      <SectionHeading>Day types</SectionHeading>
      <p className="mb-4 max-w-prose text-sage">
        Kinds of day in your week. Money compares spending between them, and Habits can run a different
        routine on each.
      </p>
      <div className="flex flex-col gap-4">
        {dayTypes.map((dayType, index) => (
          <div key={dayType.id} className="flex items-end gap-3">
            <Field
              className="flex-1"
              label={`Day type ${index + 1} name`}
              value={dayType.name}
              onChange={(event) =>
                setDayTypes(
                  dayTypes.map((item) => (item.id === dayType.id ? { ...item, name: event.target.value } : item)),
                )
              }
              error={errorAt(`general.dayTypes.${index}.name`)}
            />
            <Button
              variant="quiet"
              aria-label={`Remove ${dayType.name || `day type ${index + 1}`}`}
              onClick={() => setDayTypes(dayTypes.filter((item) => item.id !== dayType.id))}
            >
              Remove
            </Button>
          </div>
        ))}
        {errorAt('general.dayTypes') ? (
          <p role="alert" className="text-sm text-alert">
            {errorAt('general.dayTypes')}
          </p>
        ) : null}
        <Button
          variant="outline"
          className="self-start"
          onClick={() =>
            setDayTypes([...dayTypes, { id: `daytype-${Date.now().toString(36)}`, name: '' }])
          }
        >
          Add day type
        </Button>
      </div>

      <fieldset className="mt-10">
        <legend className="mb-4 font-display text-2xl text-ivory">Week pattern</legend>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {WEEK.map((day) => (
            <Select
              key={day.key}
              label={day.label}
              value={week[day.key]}
              onChange={(event) => set('general.weekPattern', { ...week, [day.key]: event.target.value })}
              error={errorAt(`general.weekPattern.${day.key}`)}
            >
              {/* Keep a removed day type visible so the mismatch is clear before saving. */}
              {dayTypes.some((dayType) => dayType.id === week[day.key]) ? null : (
                <option value={week[day.key]}>Removed day type</option>
              )}
              {dayTypes.map((dayType) => (
                <option key={dayType.id} value={dayType.id}>
                  {dayType.name || 'Unnamed'}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </fieldset>

      <SaveBar state={state} formError={formError} otherErrors={otherErrors(shown)} />
    </form>
  );
}
