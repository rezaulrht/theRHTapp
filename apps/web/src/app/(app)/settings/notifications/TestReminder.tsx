'use client';

import { Button } from '@pa/ui';
import { useCallback, useEffect, useState } from 'react';
import { useOptionalSettings } from '@/components/SettingsProvider';
import { api } from '@/lib/api';
import { SectionHeading } from '../SaveBar';

interface DeliveryResult {
  channel: string;
  status: string;
  error: string | null;
}

interface DeliveryRecord extends DeliveryResult {
  id: string;
  title: string;
  occurrenceAt: string;
}

const CHANNEL_NAMES: Record<string, string> = { push: 'Phone notification', email: 'Email' };

export function channelName(channel: string): string {
  return CHANNEL_NAMES[channel] ?? channel;
}

/** What happened to a delivery, in plain words. */
export function outcomeText(delivery: DeliveryResult): string {
  switch (delivery.status) {
    case 'sent':
      return 'Sent';
    case 'failed':
      return delivery.error ? `Not sent. ${delivery.error}` : 'Not sent';
    case 'missed':
      return 'Missed while the server was down';
    case 'suppressed':
      return 'Held back by quiet hours';
    default:
      return delivery.status;
  }
}

function when(iso: string, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

/** The "Send test reminder" button, its result, and the recent delivery history. */
export function TestReminder() {
  const timeZone = useOptionalSettings()?.settings?.['general.timezone'];
  const [results, setResults] = useState<DeliveryResult[] | null>(null);
  const [history, setHistory] = useState<DeliveryRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api<DeliveryRecord[]>('/reminders/deliveries?limit=50'));
    } catch {
      // The history is a convenience; the send result above is what matters.
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function send() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const { deliveries } = await api<{ deliveries: DeliveryResult[] }>('/reminders/test', { method: 'POST' });
      setResults(deliveries);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
      void loadHistory();
    }
  }

  return (
    <section>
      <SectionHeading>Test</SectionHeading>
      <p className="mb-4 max-w-prose text-sage">
        Sends one reminder now to your phone and your email, so you can see both arrive.
      </p>
      <Button variant="outline" loading={busy} onClick={send}>
        Send test reminder
      </Button>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-alert">
          {error}
        </p>
      ) : null}
      {results ? (
        <div role="status" className="mt-4 flex flex-col gap-1">
          {results.map((result) => (
            <p key={result.channel} className={result.status === 'sent' ? 'text-ivory' : 'text-alert'}>
              {`${channelName(result.channel)}: ${outcomeText(result)}`}
            </p>
          ))}
        </div>
      ) : null}

      <SectionHeading>Recent reminders</SectionHeading>
      {history === null ? (
        <p className="text-sage">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-sage">Nothing has been sent yet. Send a test reminder to see it here.</p>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {history.map((delivery) => (
            <li key={delivery.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
              <span className="text-ivory">{delivery.title}</span>
              <span className="text-sm text-sage tabular-nums">{when(delivery.occurrenceAt, timeZone)}</span>
              <span className={`col-span-2 text-sm ${delivery.status === 'failed' ? 'text-alert' : 'text-sage'}`}>
                {`${channelName(delivery.channel)}: ${outcomeText(delivery)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
