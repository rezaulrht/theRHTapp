import type { ItemKind, Matched, VaultItem } from './vault';

// All of the Vault's wording.

/** "2.4 MB", "820 KB", "12 bytes". */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${shown} ${units[unit]}`;
}

export type Viewer = 'pdf' | 'image' | 'markdown' | 'text';

/**
 * How a file opens in the app, or null when it only downloads. Word and
 * PowerPoint download: showing them would need a conversion service.
 */
export function viewerFor(mimeType: string, name: string): Viewer | null {
  const lower = name.toLowerCase();
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (/^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/.test(mimeType) || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(lower)) {
    return 'image';
  }
  if (/^text\/(markdown|x-markdown)$/.test(mimeType) || /\.(md|markdown)$/.test(lower)) return 'markdown';
  if (mimeType === 'text/plain' || lower.endsWith('.txt')) return 'text';
  return null;
}

/** What an item is, for a line under its name. */
export function itemMeta(item: Pick<VaultItem, 'kind' | 'file' | 'url' | 'name'>): string {
  if (item.kind === 'note') return 'Note';
  if (item.kind === 'link') {
    try {
      return new URL(item.url ?? '').host.replace(/^www\./, '');
    } catch {
      return 'Link';
    }
  }
  const extension = item.name.includes('.') ? item.name.split('.').pop()!.toUpperCase() : 'File';
  return item.file ? `${extension} · ${sizeText(item.file.size)}` : extension;
}

export function kindText(kind: ItemKind | 'folder'): string {
  return { folder: 'Folder', file: 'File', note: 'Note', link: 'Link' }[kind];
}

/** Why a search result was found. */
export function matchedText(matched: Matched): string {
  return {
    name: 'Name',
    note: 'In the note',
    link: 'In the address',
    tag: 'Tag',
    field: 'Field value',
  }[matched];
}

/** "1.2 GB of 10 GB used" */
export function storageText(used: number, allowance: number): string {
  return `${sizeText(used)} of ${sizeText(allowance)} used`;
}

/** "Removed for good on 16 December" */
export function removeText(iso: string, timeZone: string): string {
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone }).format(new Date(iso));
  return `Removed for good on ${date}`;
}

/** "Chapter 3 · 2 folders and 5 items inside" */
export function trashContentsText(folders: number, items: number): string {
  if (folders === 0 && items === 0) return '';
  const part = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const pieces = [folders > 0 ? part(folders, 'folder') : '', items > 0 ? part(items, 'item') : ''].filter(Boolean);
  return `${pieces.join(' and ')} inside`;
}
