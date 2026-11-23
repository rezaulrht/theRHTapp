'use client';

import { Button, Field } from '@pa/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ai, type AssistantStatus } from '@/lib/ai';
import { ApiError } from '@/lib/api';
import { SectionHeading } from '../SaveBar';

function describe(status: AssistantStatus): string {
  if (status.source === 'settings') return `A key is saved here, ending in ${status.hint}. The assistant is on.`;
  if (status.source === 'env') return 'The server has a key of its own. The assistant is on. A key saved here would be used instead.';
  return 'No key yet, so the assistant is off.';
}

/** Where the assistant's API key is kept. It is saved on the server, encrypted, and never shown again. */
export function AssistantSettings() {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await ai.status());
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || key.trim() === '') return;
    setBusy('save');
    setProblem(null);
    setDone(null);
    try {
      await ai.saveKey(key.trim());
      setKey('');
      setDone('Key saved.');
      await load();
    } catch (error) {
      const first = error instanceof ApiError ? error.errors?.[0]?.message : undefined;
      setProblem(first ?? (error instanceof Error ? error.message : 'Could not save the key. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy('remove');
    setProblem(null);
    setDone(null);
    try {
      await ai.removeKey();
      setDone('Key removed.');
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not remove the key. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-md">
      <SectionHeading>Assistant</SectionHeading>
      <p className="mb-6 text-sage">
        Reads a sentence such as &ldquo;Lunch 250 bkash&rdquo; and fills in the Add expense form for you to check. It uses DeepSeek, so it needs an API
        key from your DeepSeek account.
      </p>

      <p role="status" className="mb-6 text-ivory">
        {status ? describe(status) : problem ? '' : 'Checking…'}
      </p>

      <form onSubmit={save} method="post" noValidate className="flex flex-col gap-5">
        <Field
          label="DeepSeek API key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          hint="Kept on the server, encrypted. It is never shown again."
        />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={busy === 'save'}>
            {status?.source === 'settings' ? 'Replace key' : 'Save key'}
          </Button>
          {status?.source === 'settings' ? (
            <Button variant="outline" loading={busy === 'remove'} onClick={() => void remove()}>
              Remove key
            </Button>
          ) : null}
          <p role="status" className="text-sm text-brass">
            {done ?? ''}
          </p>
        </div>
        {problem ? (
          <p role="alert" className="text-sm text-alert">
            {problem}
          </p>
        ) : null}
      </form>
    </div>
  );
}
