'use client';

import { Button, Field, Select, Toggle } from '@pa/ui';
import type { Settings } from '@pa/shared';
import { useState } from 'react';
import { useOptionalSettings } from '@/components/SettingsProvider';
import { ai } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import { SectionHeading } from '../SaveBar';

type Plan = Settings['ai.weeklyReview'];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A weekly note on spending and habits, written by the assistant and sent through the reminder channels. */
export function WeeklyReviewSettings() {
  const context = useOptionalSettings();
  const saved = context?.settings?.['ai.weeklyReview'];
  const [draft, setDraft] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<'save' | 'now' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);

  if (!context || !saved) return null;
  const plan = draft ?? saved;
  const change = (patch: Partial<Plan>) => setDraft({ ...plan, ...patch });
  const toggleChannel = (channel: 'push' | 'email') =>
    change({ channels: plan.channels.includes(channel) ? plan.channels.filter((item) => item !== channel) : [...plan.channels, channel] });

  async function save() {
    if (busy || !context) return;
    setBusy('save');
    setProblem(null);
    setDone(null);
    try {
      await context.save({ 'ai.weeklyReview': plan });
      setDraft(null);
      setDone('Saved.');
    } catch (caught) {
      const first = caught instanceof ApiError ? caught.errors?.[0]?.message : undefined;
      setProblem(first ?? (caught instanceof Error ? caught.message : 'Could not save. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    if (busy) return;
    setBusy('now');
    setProblem(null);
    setReview(null);
    try {
      setReview((await ai.weeklyReviewNow()).text);
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : 'Could not write the review. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label="Weekly review" className="mt-12 max-w-md">
      <SectionHeading>Weekly review</SectionHeading>
      <p className="mb-6 text-sage">
        A short note on how your week went with money and habits, with one suggestion for the next. It is sent as a notification at the time you choose.
      </p>

      <div className="flex flex-col gap-5">
        <Toggle label="Send me a weekly review" checked={plan.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Day" value={String(plan.day)} onChange={(event) => change({ day: Number(event.target.value) })}>
            {DAYS.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </Select>
          <Field label="Time" type="time" value={plan.time} onChange={(event) => change({ time: event.target.value })} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm text-sage">Send it by</legend>
          <div className="flex gap-6">
            <Toggle label="Notification" checked={plan.channels.includes('push')} onChange={() => toggleChannel('push')} />
            <Toggle label="Email" checked={plan.channels.includes('email')} onChange={() => toggleChannel('email')} />
          </div>
        </fieldset>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button onClick={() => void save()} loading={busy === 'save'} disabled={draft === null}>
          Save changes
        </Button>
        <Button variant="outline" onClick={() => void sendNow()} loading={busy === 'now'}>
          Send one now
        </Button>
        <p role="status" className="text-sm text-brass">
          {done ?? ''}
        </p>
      </div>
      {problem ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {problem}
        </p>
      ) : null}
      {review ? (
        <p role="status" className="mt-4 whitespace-pre-line rounded-[var(--radius-control)] border border-hairline p-4 text-ivory">
          {review}
        </p>
      ) : null}
    </section>
  );
}
