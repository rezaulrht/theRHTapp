'use client';

import { Button, Field } from '@pa/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { safeNextPath } from '@/lib/route-guard';

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  if (error.status === 423) {
    const seconds = Number(error.data.retryAfterSeconds) || 60;
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  }
  return error.message;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', json: { email, password } });
      router.replace(safeNextPath(searchParams.get('next')));
    } catch (caught) {
      setError(messageFor(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-5" noValidate>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy} className="mt-2">
        Log in
      </Button>
    </form>
  );
}
