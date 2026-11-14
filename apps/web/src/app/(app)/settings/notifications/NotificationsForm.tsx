'use client';

import { Field, Toggle } from '@pa/ui';
import type { FormEvent } from 'react';
import { SaveBar, SectionHeading } from '../SaveBar';
import { useSettingsDraft } from '../useSettingsDraft';

export function NotificationsForm() {
  const { draft, set, submit, state, errorAt, otherErrors, formError, loadError } = useSettingsDraft();

  if (loadError) {
    return (
      <p role="alert" className="text-alert">
        {loadError}
      </p>
    );
  }
  if (!draft) return <p className="text-sage">Loading your settings…</p>;

  const quiet = draft['general.quietHours'];
  const shown = ['general.notificationEmail', 'general.quietHours.start', 'general.quietHours.end'];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate>
      <SectionHeading>Email</SectionHeading>
      <Field
        className="max-w-md"
        label="Email for reminders"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={draft['general.notificationEmail']}
        onChange={(event) => set('general.notificationEmail', event.target.value)}
        error={errorAt('general.notificationEmail')}
        hint="Leave empty to get no reminder emails."
      />

      <SectionHeading>Quiet hours</SectionHeading>
      <p className="mb-4 max-w-prose text-sage">
        Nothing is sent during quiet hours, except reminders you mark to come through anyway, such as a
        morning alarm.
      </p>
      <div className="max-w-md">
        <Toggle
          label="Quiet hours"
          checked={quiet.enabled}
          onChange={(event) => set('general.quietHours', { ...quiet, enabled: event.target.checked })}
        />
        <div className="mt-4 grid grid-cols-2 gap-5">
          <Field
            label="Quiet from"
            type="time"
            value={quiet.start}
            onChange={(event) => set('general.quietHours', { ...quiet, start: event.target.value })}
            error={errorAt('general.quietHours.start')}
          />
          <Field
            label="Quiet until"
            type="time"
            value={quiet.end}
            onChange={(event) => set('general.quietHours', { ...quiet, end: event.target.value })}
            error={errorAt('general.quietHours.end')}
          />
        </div>
      </div>

      <SaveBar state={state} formError={formError} otherErrors={otherErrors(shown)} />
    </form>
  );
}
