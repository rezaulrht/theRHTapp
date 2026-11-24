'use client';

import { Button, Field } from '@pa/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { storage, type R2Details, type R2Status } from '@/lib/storage';
import { SectionHeading } from '../SaveBar';

const EMPTY: R2Details = { accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '' };

function describe(status: R2Status): string {
  if (status.source === 'settings') return `Cloudflare R2 is set up here: bucket ${status.bucket}, access key ending ${status.accessKeyEnd}. Vault files are kept there.`;
  if (status.source === 'env') return `Cloudflare R2 is set up on the server (bucket ${status.bucket}). Details saved here would be used instead.`;
  return 'No file storage yet. Uploads to the Vault will not work until you add Cloudflare R2.';
}

/** Where Vault files live. The keys are tried against the bucket, then saved on the server, encrypted and never shown again. */
export function StorageSettings() {
  const [status, setStatus] = useState<R2Status | null>(null);
  const [details, setDetails] = useState<R2Details>(EMPTY);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await storage.status());
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (field: keyof R2Details) => (event: { target: { value: string } }) => setDetails({ ...details, [field]: event.target.value });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy('save');
    setProblem(null);
    setDone(null);
    try {
      await storage.save({
        accountId: details.accountId.trim(),
        accessKeyId: details.accessKeyId.trim(),
        secretAccessKey: details.secretAccessKey.trim(),
        bucket: details.bucket.trim(),
      });
      setDetails(EMPTY);
      setDone('Tested and saved. Vault uploads now go to this bucket.');
      await load();
    } catch (error) {
      const first = error instanceof ApiError ? error.errors?.[0]?.message : undefined;
      setProblem(first ?? (error instanceof Error ? error.message : 'Could not save. Try again.'));
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
      await storage.remove();
      setDone('Removed.');
      await load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not remove. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-md">
      <SectionHeading>Vault file storage</SectionHeading>
      <p className="mb-6 text-sage">
        Files you add to the Vault are kept in a private Cloudflare R2 bucket. The details are tried against the bucket when you save, so a wrong key is
        caught straight away.
      </p>

      <p role="status" className="mb-6 text-ivory">
        {status ? describe(status) : problem ? '' : 'Checking…'}
      </p>

      <form onSubmit={save} method="post" noValidate className="flex flex-col gap-5">
        <Field label="Account ID" autoComplete="off" spellCheck={false} value={details.accountId} onChange={set('accountId')} />
        <Field label="Access key ID" autoComplete="off" spellCheck={false} value={details.accessKeyId} onChange={set('accessKeyId')} />
        <Field
          label="Secret access key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={details.secretAccessKey}
          onChange={set('secretAccessKey')}
          hint="Kept on the server, encrypted. It is never shown again."
        />
        <Field label="Bucket name" autoComplete="off" spellCheck={false} value={details.bucket} onChange={set('bucket')} />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={busy === 'save'}>
            {status?.source === 'settings' ? 'Replace and test' : 'Test and save'}
          </Button>
          {status?.source === 'settings' ? (
            <Button variant="outline" loading={busy === 'remove'} onClick={() => void remove()}>
              Remove
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

      <details className="mt-10 text-sm text-sage">
        <summary className="cursor-pointer text-ivory">Setting up the bucket in Cloudflare</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>Create a bucket in R2 and keep it private.</li>
          <li>Create an API token with Object Read and Write on that bucket. Cloudflare then shows the access key ID and secret once.</li>
          <li>
            Open the bucket&rsquo;s Settings and add a CORS policy that allows your site&rsquo;s address, the methods GET, PUT and HEAD, and the header
            Content-Type. Without this, the browser cannot upload.
          </li>
          <li>Paste the account ID (shown in R2), the keys and the bucket name above.</li>
        </ol>
      </details>
    </div>
  );
}
