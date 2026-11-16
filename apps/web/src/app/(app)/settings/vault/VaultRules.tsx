'use client';

import { Field } from '@pa/ui';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { storageText } from '@/lib/vault-text';
import { Section } from '../parts';
import { SaveBar } from '../SaveBar';
import { useSettingsDraft } from '../useSettingsDraft';

type Key = 'vault.maxFileMb' | 'vault.trashDays';

/** A whole-number box that can be emptied while typing; the draft holds the number. */
function WholeNumber({
  label,
  value,
  onValue,
  error,
  hint,
}: {
  label: string;
  value: number | undefined;
  onValue(value: number): void;
  error?: string;
  hint?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  // Filled once, when the settings arrive; after that the box is the owner's.
  const filled = useRef(value !== undefined);
  useEffect(() => {
    if (value !== undefined && !filled.current) {
      filled.current = true;
      setText(String(value));
    }
  }, [value]);
  return (
    <Field
      label={label}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        const next = event.target.value.replace(/\D/g, '');
        setText(next);
        if (next !== '') onValue(Number(next));
      }}
      error={error}
      hint={hint}
    />
  );
}

/** Space used against the free allowance, as a bar that fills on arrival. */
export function StorageBar({ used, allowance }: { used: number; allowance: number }) {
  const share = allowance > 0 ? Math.min(used / allowance, 1) : 0;
  return (
    <div>
      <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-ivory/[0.06]">
        <motion.div
          className="h-full origin-left rounded-full"
          style={{ width: `${Math.max(share * 100, 1)}%`, background: share > 0.9 ? 'var(--color-alert)' : 'var(--color-brass)' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        />
      </div>
      <p className="mt-2 text-sm text-sage">{storageText(used, allowance)}</p>
    </div>
  );
}

/** The largest file allowed and how long the trash keeps things. */
export function VaultRules({ storage }: { storage: { used: number; allowance: number; files: number } | null }) {
  const { draft, set, submit, state, errorAt, otherErrors, formError } = useSettingsDraft();
  if (!draft) return null;
  const number = (key: Key) => (value: number) => set(key, value);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  return (
    <Section title="Files and trash">
      {storage ? (
        <div className="mb-8">
          <h3 className="mb-2 text-sm text-sage">Storage</h3>
          <StorageBar used={storage.used} allowance={storage.allowance} />
          <p className="mt-1 text-xs text-sage">
            {storage.files} {storage.files === 1 ? 'file' : 'files'}, those in the trash included. The free allowance is 10 GB.
          </p>
        </div>
      ) : null}
      <form onSubmit={onSubmit} method="post" noValidate className="grid max-w-xl gap-4 sm:grid-cols-2">
        <WholeNumber
          label="Largest file (MB)"
          value={draft['vault.maxFileMb']}
          onValue={number('vault.maxFileMb')}
          error={errorAt('vault.maxFileMb')}
        />
        <WholeNumber
          label="Keep deleted things for (days)"
          value={draft['vault.trashDays']}
          onValue={number('vault.trashDays')}
          error={errorAt('vault.trashDays')}
        />
        <div className="sm:col-span-2">
          <SaveBar state={state} formError={formError} otherErrors={otherErrors(['vault.maxFileMb', 'vault.trashDays'])} />
        </div>
      </form>
    </Section>
  );
}
