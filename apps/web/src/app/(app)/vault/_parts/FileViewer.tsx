'use client';

import { Button } from '@pa/ui';
import { useEffect, useState } from 'react';
import { vault, type VaultItem } from '@/lib/vault';
import { sizeText, viewerFor } from '@/lib/vault-text';
import { Markdown } from './Markdown';

/**
 * A file, opened in the app when it can be (PDF, image, markdown, text);
 * otherwise a download. Addresses are fetched fresh because they expire.
 */
export function FileViewer({ item }: { item: VaultItem }) {
  const file = item.file!;
  const viewer = viewerFor(file.mimeType, item.name);
  const [src, setSrc] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const fail = (caught: unknown) => current && setError(caught instanceof Error ? caught.message : 'Could not open the file.');
    if (viewer === 'pdf' || viewer === 'image') {
      vault.fileUrl(item.id, true).then((answer) => current && setSrc(answer.url), fail);
    } else if (viewer === 'markdown' || viewer === 'text') {
      vault.fileText(item.id).then((answer) => current && setText(answer.text), fail);
    }
    return () => {
      current = false;
    };
  }, [item.id, viewer]);

  async function open(inline: boolean) {
    setError(null);
    try {
      const { url } = await vault.fileUrl(item.id, inline);
      if (inline) window.open(url, '_blank', 'noopener');
      else window.location.assign(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not get the file.');
    }
  }

  return (
    <section aria-label="File">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => void open(false)}>
          Download
        </Button>
        {viewer === 'pdf' ? (
          <Button variant="quiet" onClick={() => void open(true)}>
            Open full screen
          </Button>
        ) : null}
        <span className="text-sm text-sage">{sizeText(file.size)}</span>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {viewer === null ? (
        <p className="max-w-prose border-y border-hairline py-6 text-sage">
          This kind of file does not open in the app. Download it to open it on your device.
        </p>
      ) : null}
      {viewer === 'pdf' && src ? (
        <iframe src={src} title={item.name} className="h-[75dvh] w-full rounded-[var(--radius-control)] border border-hairline bg-ivory" />
      ) : null}
      {viewer === 'image' && src ? (
        <img src={src} alt={item.name} className="max-h-[75dvh] max-w-full rounded-[var(--radius-control)] border border-hairline" />
      ) : null}
      {viewer === 'markdown' && text !== null ? <Markdown text={text} /> : null}
      {viewer === 'text' && text !== null ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-control)] border border-hairline p-4 font-mono text-sm text-ivory" data-lenis-prevent>
          {text}
        </pre>
      ) : null}
    </section>
  );
}
