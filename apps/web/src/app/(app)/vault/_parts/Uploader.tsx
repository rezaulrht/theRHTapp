'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { EASE_OUT } from '@/components/motion/ease';
import { useSettings } from '@/components/SettingsProvider';
import { sendFile, vault } from '@/lib/vault';
import { sizeText } from '@/lib/vault-text';

type State = 'waiting' | 'sending' | 'done' | 'failed';

interface Job {
  key: string;
  name: string;
  size: number;
  state: State;
  message?: string;
}

/** Files go up three at a time, so a big batch does not swamp a phone connection. */
const AT_ONCE = 3;

/**
 * Uploads several files at once, each straight to storage, and shows a line
 * per file. A file that fails says why without stopping the others.
 */
export function useUploads(folderId: string | null, onDone: () => void) {
  const { settings } = useSettings();
  const maxMb = settings?.['vault.maxFileMb'] ?? 100;
  const [jobs, setJobs] = useState<Job[]>([]);
  const counter = useRef(0);

  const update = (key: string, change: Partial<Job>) =>
    setJobs((current) => current.map((job) => (job.key === key ? { ...job, ...change } : job)));

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const batch = files.map((file) => ({ file, key: `u${counter.current++}` }));
      setJobs((current) => [
        ...current.filter((job) => job.state !== 'done'),
        ...batch.map(({ file, key }) => ({ key, name: file.name, size: file.size, state: 'waiting' as State })),
      ]);

      const send = async ({ file, key }: { file: File; key: string }) => {
        // Refused here, before any of it is sent.
        if (file.size > maxMb * 1024 ** 2) {
          update(key, { state: 'failed', message: `Larger than the ${maxMb} MB limit` });
          return;
        }
        update(key, { state: 'sending' });
        try {
          const started = await vault.startUpload(folderId, file.name, file.size, file.type);
          await sendFile(started.upload, file);
          await vault.completeUpload(started.item.id);
          update(key, { state: 'done' });
        } catch (caught) {
          update(key, { state: 'failed', message: caught instanceof Error ? caught.message : 'Could not upload' });
        }
      };

      const queue = [...batch];
      const workers = Array.from({ length: Math.min(AT_ONCE, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await send(next);
      });
      await Promise.all(workers);
      onDone();
    },
    [folderId, maxMb, onDone],
  );

  const clear = useCallback(() => setJobs((current) => current.filter((job) => job.state === 'sending' || job.state === 'waiting')), []);

  return { jobs, add, clear, maxMb };
}

const stateText: Record<State, string> = { waiting: 'Waiting', sending: 'Uploading', done: 'Uploaded', failed: 'Not uploaded' };

/** A line per file being uploaded. */
export function UploadList({ jobs, onClear }: { jobs: Job[]; onClear(): void }) {
  if (jobs.length === 0) return null;
  const finished = jobs.every((job) => job.state === 'done' || job.state === 'failed');
  return (
    <section aria-label="Uploads" className="mb-6 rounded-[var(--radius-control)] border border-hairline p-3">
      <ul className="flex flex-col gap-1.5 text-sm">
        <AnimatePresence initial={false}>
          {jobs.map((job) => (
            <motion.li
              key={job.key}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0 truncate text-ivory">
                {job.name} <span className="text-sage">{sizeText(job.size)}</span>
              </span>
              <span
                className={`shrink-0 ${job.state === 'failed' ? 'text-alert' : job.state === 'done' ? 'text-brass' : 'animate-pulse text-sage'}`}
              >
                {stateText[job.state]}
                {job.message ? `: ${job.message}` : ''}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {finished ? (
        <button type="button" onClick={onClear} className="mt-2 text-xs text-sage hover:text-ivory">
          Clear
        </button>
      ) : null}
    </section>
  );
}

/** On a computer, files can be dropped anywhere on the folder. */
export function DropZone({ onFiles, children }: { onFiles(files: File[]): void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      <AnimatePresence>
        {over ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-3 z-20 grid place-items-center rounded-[1.25rem] border-2 border-dashed border-brass bg-ground/80 backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <p className="font-display text-3xl text-brass">Drop to upload</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
