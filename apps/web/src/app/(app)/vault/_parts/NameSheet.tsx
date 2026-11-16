'use client';

import { Button, Field } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { Sheet } from '@/components/Sheet';
import { ApiError } from '@/lib/api';

export interface NameSheetValues {
  name: string;
  url: string;
}

/** Asks for a name (and an address, for a link), for something new or renamed. */
export function NameSheet({
  title,
  action,
  initialName = '',
  withUrl = false,
  onSubmit,
  onClose,
}: {
  title: string;
  action: string;
  initialName?: string;
  withUrl?: boolean;
  onSubmit(values: NameSheetValues): Promise<void>;
  onClose(): void;
}) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = 'Enter a name';
    if (withUrl && !url.trim()) local.url = 'Enter a web address';
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await onSubmit({ name: name.trim(), url: url.trim() });
    } catch (caught) {
      if (caught instanceof ApiError && caught.errors?.length) {
        setErrors(Object.fromEntries(caught.errors.map((error) => [error.path === 'url' ? 'url' : 'name', error.message])));
      } else {
        setErrors({ name: caught instanceof Error ? caught.message : 'Could not save. Try again.' });
      }
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} method="post" noValidate className="flex flex-col gap-5">
        {withUrl ? (
          <Field
            label="Web address"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoFocus
            placeholder="https://"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            error={errors.url}
          />
        ) : null}
        <Field
          label="Name"
          autoComplete="off"
          autoFocus={!withUrl}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" loading={busy} className="flex-1">
            {action}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
