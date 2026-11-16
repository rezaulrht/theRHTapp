import type { ItemKind } from '@/lib/vault';

/** A small line icon for a folder, file, note or link. */
export function KindIcon({ kind, className = '' }: { kind: ItemKind | 'folder'; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {kind === 'folder' ? <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> : null}
      {kind === 'file' ? (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </>
      ) : null}
      {kind === 'note' ? (
        <>
          <path d="M5 4h14v16H5z" />
          <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
        </>
      ) : null}
      {kind === 'link' ? (
        <>
          <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
        </>
      ) : null}
    </svg>
  );
}
