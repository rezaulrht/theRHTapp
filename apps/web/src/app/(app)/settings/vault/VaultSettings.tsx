'use client';

import { useCallback, useEffect, useState } from 'react';
import { FadeUp } from '@/components/motion/Stagger';
import { vault, type VaultField, type VaultTag } from '@/lib/vault';
import { FieldsEditor } from './FieldsEditor';
import { TagsEditor } from './TagsEditor';
import { VaultRules } from './VaultRules';

/** Everything about the Vault the owner can change. */
export function VaultSettings() {
  const [data, setData] = useState<{ fields: VaultField[]; tags: VaultTag[] } | null>(null);
  const [storage, setStorage] = useState<{ used: number; allowance: number; files: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [fields, tags] = await Promise.all([vault.fields(), vault.tags()]);
      setData({ fields, tags });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load.');
    }
  }, []);

  useEffect(() => {
    void reload();
    vault
      .storage()
      .then(setStorage)
      .catch(() => setStorage(null));
  }, [reload]);

  if (!data) {
    return error ? (
      <p role="alert" className="text-alert">
        {error}
      </p>
    ) : (
      <p className="text-sage">Loading your Vault settings…</p>
    );
  }

  return (
    <FadeUp>
      <FieldsEditor fields={data.fields} onChanged={reload} />
      <TagsEditor tags={data.tags} onChanged={reload} />
      <VaultRules storage={storage} />
    </FadeUp>
  );
}
