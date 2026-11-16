'use client';

import { Button, Field, Toggle } from '@pa/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import { ApiError } from '@/lib/api';
import { instantOn, timeText } from '@/lib/habits-text';
import { dayLabel } from '@/lib/money-text';
import { vault, type Channel, type Schedule, type VaultReminder } from '@/lib/vault';

const WEEK = [
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
];

/** "Every Friday at 8:00 am", "Once, 1 December at 7:00 am". */
export function scheduleText(schedule: Schedule, timeZone: string): string {
  const clock = (time: string) => {
    const [hour = 0, minute = 0] = time.split(':').map(Number);
    const half = hour < 12 ? 'am' : 'pm';
    return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${half}`;
  };
  if (schedule.kind === 'once') {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(schedule.at));
    return `Once, ${dayLabel(day).split(', ')[1]} at ${timeText(schedule.at, timeZone)}`;
  }
  if (schedule.kind === 'weekly') {
    const days = schedule.days.length === 7 ? 'day' : WEEK.filter((day) => schedule.days.includes(day.value)).map((day) => day.long).join(', ');
    return `Every ${days} at ${clock(schedule.time)}`;
  }
  return `Every ${schedule.everyMinutes} minutes, ${clock(schedule.start)} to ${clock(schedule.end)}`;
}

/** Reminders on a folder or item: once or every week, by notification or email. */
export function RemindersPanel({ owner, defaultTitle }: { owner: string; defaultTitle: string }) {
  const { settings } = useSettings();
  const timeZone = settings?.['general.timezone'] ?? 'Asia/Dhaka';
  const [list, setList] = useState<VaultReminder[]>([]);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [repeat, setRepeat] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([]);
  const [channels, setChannels] = useState<Channel[]>(['push']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await vault.reminders(owner));
    } catch {
      setList([]);
    }
  }, [owner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const local: Record<string, string> = {};
    if (!title.trim()) local.title = 'Give it a title';
    if (!time) local.time = 'Pick a time';
    if (repeat && days.length === 0) local.days = 'Pick at least one day';
    if (!repeat && !date) local.date = 'Pick a date';
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    const schedule: Schedule = repeat
      ? { kind: 'weekly', days: [...days].sort(), time }
      : { kind: 'once', at: instantOn(date, time, timeZone, 0).toISOString() };
    setBusy(true);
    setErrors({});
    try {
      await vault.createReminder({ owner, title: title.trim(), schedule, channels });
      setAdding(false);
      setDate('');
      setDays([]);
      await load();
    } catch (caught) {
      setErrors({
        form:
          caught instanceof ApiError && caught.errors?.length
            ? caught.errors.map((error) => error.message).join(' ')
            : caught instanceof Error
              ? caught.message
              : 'Could not save. Try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reminders-heading">
      <h2 id="reminders-heading" className="mb-3 text-sm text-sage">
        Reminders
      </h2>
      {list.length > 0 ? (
        <ul aria-label="Reminders on this" className="mb-3 border-t border-hairline">
          {list.map((reminder) => (
            <li key={reminder.id} className="flex items-center justify-between gap-3 border-b border-hairline py-2">
              <span className="min-w-0">
                <span className="block truncate text-ivory">{reminder.title}</span>
                <span className="text-sm text-sage">
                  {scheduleText(reminder.schedule, timeZone)}
                  {reminder.next ? '' : ' · done'}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove the reminder ${reminder.title}`}
                onClick={async () => {
                  await vault.deleteReminder(reminder.id);
                  await load();
                }}
                className="grid size-10 shrink-0 place-items-center rounded-full text-sage hover:text-alert"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <form onSubmit={add} method="post" noValidate className="flex max-w-md flex-col gap-4 rounded-[var(--radius-control)] border border-hairline p-4">
          <Field label="Reminder" autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} error={errors.title} />
          <Toggle label="Every week" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
          {repeat ? (
            <fieldset>
              <legend className="mb-2 text-sm text-sage">On</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEK.map((day) => {
                  const on = days.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      className={`flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm ${on ? 'border-brass bg-brass text-ground' : 'border-hairline text-sage'}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        aria-label={day.long}
                        checked={on}
                        onChange={() => setDays(on ? days.filter((value) => value !== day.value) : [...days, day.value])}
                      />
                      {day.short}
                    </label>
                  );
                })}
              </div>
              {errors.days ? <p className="mt-1 text-sm text-alert">{errors.days}</p> : null}
            </fieldset>
          ) : (
            <Field label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} error={errors.date} className="[color-scheme:dark]" />
          )}
          <Field label="Time" type="time" value={time} onChange={(event) => setTime(event.target.value)} error={errors.time} className="[color-scheme:dark]" />
          <div>
            <Toggle label="Phone notification" checked={channels.includes('push')} onChange={(event) => setChannels(event.target.checked ? [...channels, 'push'] : channels.filter((c) => c !== 'push'))} />
            <Toggle label="Email" checked={channels.includes('email')} onChange={(event) => setChannels(event.target.checked ? [...channels, 'email'] : channels.filter((c) => c !== 'email'))} />
          </div>
          {errors.form ? (
            <p role="alert" className="text-sm text-alert">
              {errors.form}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" loading={busy}>
              Add reminder
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add a reminder
        </Button>
      )}
    </section>
  );
}
