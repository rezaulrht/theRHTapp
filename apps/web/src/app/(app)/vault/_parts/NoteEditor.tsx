'use client';

import { Button } from '@pa/ui';
import { useEffect, useState } from 'react';
import { vault, type VaultItem } from '@/lib/vault';
import { Markdown } from './Markdown';

type Mode = 'read' | 'write';

/**
 * A note: read as formatted text, or written in markdown with a preview. An
 * AI answer can be pasted straight in. Unsaved text is not lost by leaving.
 */
export function NoteEditor({ item, startWriting, onSaved }: { item: VaultItem; startWriting: boolean; onSaved(next: VaultItem): void }) {
  const saved = item.body ?? '';
  const [mode, setMode] = useState<Mode>(startWriting || saved === '' ? 'write' : 'read');
  const [text, setText] = useState(saved);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const dirty = text !== saved;

  // Warn before the tab is closed or reloaded with unsaved text.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (!dirty || state === 'saving') return;
    setState('saving');
    setError(null);
    try {
      const next = await vault.updateItem(item.id, { body: text });
      onSaved(next);
      setState('saved');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
      setState('idle');
    }
  }

  return (
    <section aria-label="Note">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Note view" className="flex rounded-full border border-hairline p-0.5">
          {(['read', 'write'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-10 rounded-full px-4 text-sm transition-colors duration-200 ${mode === value ? 'bg-brass text-ground' : 'text-sage hover:text-ivory'}`}
            >
              {value === 'read' ? 'Read' : 'Write'}
            </button>
          ))}
        </div>
        {mode === 'write' ? (
          <>
            <Button onClick={() => void save()} loading={state === 'saving'} disabled={!dirty}>
              Save note
            </Button>
            <span role="status" className="text-sm text-sage">
              {dirty ? 'Not saved yet' : state === 'saved' ? 'Saved' : ''}
            </span>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {mode === 'write' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-sage">Markdown</span>
            <textarea
              value={text}
              autoFocus={startWriting}
              onChange={(event) => {
                setText(event.target.value);
                setState('idle');
              }}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                  event.preventDefault();
                  void save();
                }
              }}
              placeholder="Write, or paste an answer here. # for a heading, - for a list."
              className="min-h-[60dvh] w-full resize-y rounded-[var(--radius-control)] border border-hairline bg-ground p-4 font-mono text-sm leading-relaxed text-ivory placeholder:text-sage/60"
              data-lenis-prevent
            />
          </label>
          <div className="hidden lg:block">
            <span className="text-sm text-sage">Preview</span>
            <div className="mt-1.5 min-h-[60dvh] rounded-[var(--radius-control)] border border-hairline p-4">
              {text ? <Markdown text={text} /> : <p className="text-sage">Nothing written yet.</p>}
            </div>
          </div>
        </div>
      ) : text ? (
        <Markdown text={text} />
      ) : (
        <p className="text-sage">This note is empty.</p>
      )}
    </section>
  );
}
