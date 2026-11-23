'use client';

import { Button, Field } from '@pa/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiError, type FieldError } from '@/lib/api';
import { clearCache } from '@/lib/cache';
import { SectionHeading } from '../SaveBar';

export function SecurityForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const errorAt = (path: string) => errors.find((error) => error.path === path)?.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors([]);
    setFormError(null);
    setChanged(false);
    try {
      await api('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setChanged(true);
    } catch (error) {
      if (error instanceof ApiError && error.errors?.length) setErrors(error.errors);
      else setFormError(error instanceof Error ? error.message : 'Could not change the password. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function logOut() {
    setLoggingOut(true);
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Either way the owner wants to leave; the login page is the right place.
    }
    clearCache();
    router.replace('/login');
  }

  return (
    <>
      <form onSubmit={onSubmit} method="post" noValidate className="max-w-md">
        <SectionHeading>Password</SectionHeading>
        <div className="flex flex-col gap-5">
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            error={errorAt('currentPassword')}
          />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={errorAt('newPassword')}
            hint="At least 10 characters."
          />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button type="submit" loading={busy}>
            Change password
          </Button>
          <p role="status" className="text-sm text-brass">
            {changed ? 'Password changed. Other devices were logged out.' : ''}
          </p>
          {formError ? (
            <p role="alert" className="basis-full text-sm text-alert">
              {formError}
            </p>
          ) : null}
        </div>
      </form>

      <SectionHeading>This device</SectionHeading>
      <Button variant="outline" loading={loggingOut} onClick={logOut}>
        Log out
      </Button>
    </>
  );
}
