'use client';

import { CHANNELS } from '@pa/shared';
import { Field, Toggle } from '@pa/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { channelName } from '../notifications/TestReminder';
import { SaveBar } from '../SaveBar';
import { useSettingsDraft } from '../useSettingsDraft';
import { Section } from '../parts';

/** The budget warning level and the evening nudge to write the day down. */
export function MoneyPreferences() {
  const { draft, set, submit, state, errorAt, otherErrors, formError } = useSettingsDraft();
  const loadedPercent = draft?.['money.budgetWarnPercent'];
  // Filled at first render when the settings are already here, so nothing typed is ever overwritten.
  const [percent, setPercent] = useState(loadedPercent === undefined ? '' : String(loadedPercent));
  const filled = useRef(loadedPercent !== undefined);

  // The box holds text so it can be emptied while typing; the draft holds the number.
  // Otherwise it is filled once, when the settings arrive, and after that it is the owner's.
  useEffect(() => {
    if (loadedPercent !== undefined && !filled.current) {
      filled.current = true;
      setPercent(String(loadedPercent));
    }
  }, [loadedPercent]);

  if (!draft) return null;

  const reminder = draft['money.dailyReminder'];
  const setReminder = (change: Partial<typeof reminder>) => set('money.dailyReminder', { ...reminder, ...change });
  const shown = ['money.budgetWarnPercent', 'money.dailyReminder.time', 'money.dailyReminder.channels'];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <Section title="Reminders and warnings">
      <form onSubmit={onSubmit} method="post" noValidate className="max-w-md">
        <Field
          label="Warn me when a budget is this much used (%)"
          inputMode="numeric"
          autoComplete="off"
          value={percent}
          onChange={(event) => {
            const text = event.target.value.replace(/[^\d]/g, '');
            setPercent(text);
            if (text !== '') set('money.budgetWarnPercent', Number(text));
          }}
          error={errorAt('money.budgetWarnPercent')}
          hint="A reminder is sent once when a budget passes this, and again if you go over."
        />

        <div className="mt-6">
          <Toggle
            label="Daily reminder to log spending"
            checked={reminder.enabled}
            onChange={(event) => setReminder({ enabled: event.target.checked })}
          />
          <Field
            className="mt-3"
            label="Remind me at"
            type="time"
            value={reminder.time}
            onChange={(event) => setReminder({ time: event.target.value || reminder.time })}
            error={errorAt('money.dailyReminder.time')}
          />
          <fieldset className="mt-4">
            <legend className="text-sm text-sage">Send it by</legend>
            {CHANNELS.map((channel) => (
              <Toggle
                key={channel}
                label={channelName(channel)}
                checked={reminder.channels.includes(channel)}
                onChange={(event) =>
                  setReminder({
                    channels: event.target.checked
                      ? CHANNELS.filter((item) => item === channel || reminder.channels.includes(item))
                      : reminder.channels.filter((item) => item !== channel),
                  })
                }
              />
            ))}
            {errorAt('money.dailyReminder.channels') ? (
              <p className="text-sm text-alert">{errorAt('money.dailyReminder.channels')}</p>
            ) : null}
          </fieldset>
          <Toggle
            className="mt-2"
            label="Skip it on days I have already logged something"
            checked={reminder.skipIfLogged}
            onChange={(event) => setReminder({ skipIfLogged: event.target.checked })}
          />
        </div>

        <SaveBar state={state} formError={formError} otherErrors={otherErrors(shown)} />
      </form>
    </Section>
  );
}
