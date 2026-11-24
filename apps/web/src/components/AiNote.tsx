'use client';

import { Button } from '@pa/ui';
import { useState } from 'react';

/**
 * A button that asks the assistant for a short text and shows it. For things
 * like "Summarise my day" or "Find patterns". Shows nothing special until
 * pressed, and says plainly when the assistant fails.
 */
export function AiNote({
  label,
  busyLabel = 'Thinking…',
  load,
  className = '',
}: {
  label: string;
  busyLabel?: string;
  load(): Promise<{ text: string }>;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setText((await load()).text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button variant="outline" loading={busy} onClick={() => void run()}>
        {busy ? busyLabel : text ? 'Ask again' : label}
      </Button>
      {text ? (
        <p role="status" className="mt-4 max-w-prose whitespace-pre-line rounded-[var(--radius-control)] border border-hairline p-4 text-ivory">
          {text}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
