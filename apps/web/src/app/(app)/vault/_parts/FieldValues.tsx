'use client';

import { Field, Select, Toggle } from '@pa/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { vault, type VaultField } from '@/lib/vault';

type Owner = { folderId: string } | { itemId: string };

/**
 * The owner's own fields on a folder or item: one control per type. Each
 * saves when it is changed (text when you leave the box).
 */
export function FieldValues({ owner, values }: { owner: Owner; values: Record<string, unknown> }) {
  const [fields, setFields] = useState<VaultField[] | null>(null);
  const [current, setCurrent] = useState<Record<string, unknown>>(values);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    vault
      .fields()
      .then(setFields)
      .catch(() => setFields([]));
  }, []);

  async function save(field: VaultField, value: unknown) {
    setErrors((now) => ({ ...now, [field.id]: '' }));
    setSaved(null);
    try {
      const answer = await vault.setValue({ fieldId: field.id, ...owner, value });
      setCurrent((now) => {
        const next = { ...now };
        if (answer.value === null) delete next[field.id];
        else next[field.id] = answer.value;
        return next;
      });
      setSaved(field.id);
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.errors?.length
          ? caught.errors[0]!.message
          : caught instanceof Error
            ? caught.message
            : 'Could not save';
      setErrors((now) => ({ ...now, [field.id]: message }));
    }
  }

  if (fields === null) return null;
  const live = fields.filter((field) => !field.archived);
  const leftOver = fields.filter((field) => field.archived && current[field.id] !== undefined);

  if (live.length === 0 && leftOver.length === 0) {
    return (
      <section aria-labelledby="fields-heading">
        <h2 id="fields-heading" className="mb-2 text-sm text-sage">
          Fields
        </h2>
        <p className="text-sm text-sage/80">
          Make your own fields, such as Teacher or Exam date, in{' '}
          <Link href="/settings/vault" className="text-brass hover:text-ivory">
            Settings
          </Link>
          .
        </p>
      </section>
    );
  }

  const text = (field: VaultField) => drafts[field.id] ?? (current[field.id] === undefined ? '' : String(current[field.id]));
  const setText = (field: VaultField, value: string) => setDrafts((now) => ({ ...now, [field.id]: value }));
  const commitText = (field: VaultField) => {
    const draft = drafts[field.id];
    if (draft === undefined) return;
    const stored = current[field.id] === undefined ? '' : String(current[field.id]);
    if (draft === stored) return;
    if (draft.trim() === '') {
      void save(field, null);
      return;
    }
    if (field.type === 'number' && !Number.isFinite(Number(draft.replace(/,/g, '')))) {
      setErrors((now) => ({ ...now, [field.id]: 'Enter a number' }));
      return;
    }
    void save(field, field.type === 'number' ? Number(draft.replace(/,/g, '')) : draft);
  };

  return (
    <section aria-labelledby="fields-heading">
      <h2 id="fields-heading" className="mb-3 text-sm text-sage">
        Fields
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {live.map((field) => {
          const hint = saved === field.id ? 'Saved' : undefined;
          if (field.type === 'boolean') {
            return (
              <Toggle
                key={field.id}
                label={field.name}
                checked={current[field.id] === true}
                onChange={(event) => void save(field, event.target.checked)}
              />
            );
          }
          if (field.type === 'choice') {
            return (
              <Select
                key={field.id}
                label={field.name}
                value={typeof current[field.id] === 'string' ? (current[field.id] as string) : ''}
                onChange={(event) => void save(field, event.target.value || null)}
                error={errors[field.id] || undefined}
              >
                <option value="">Not set</option>
                {field.choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </Select>
            );
          }
          if (field.type === 'date') {
            return (
              <Field
                key={field.id}
                label={field.name}
                type="date"
                value={text(field)}
                onChange={(event) => void save(field, event.target.value || null)}
                error={errors[field.id] || undefined}
                hint={hint}
                className="[color-scheme:dark]"
              />
            );
          }
          return (
            <Field
              key={field.id}
              label={field.name}
              type={field.type === 'url' ? 'url' : 'text'}
              inputMode={field.type === 'number' ? 'decimal' : field.type === 'url' ? 'url' : undefined}
              autoComplete="off"
              value={text(field)}
              onChange={(event) => setText(field, event.target.value)}
              onBlur={() => commitText(field)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitText(field);
              }}
              error={errors[field.id] || undefined}
              hint={hint}
            />
          );
        })}
      </div>
      {leftOver.length > 0 ? (
        <ul className="mt-4 text-sm text-sage">
          {leftOver.map((field) => (
            <li key={field.id}>
              {field.name} (archived field): {String(current[field.id])}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
