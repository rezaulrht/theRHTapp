/**
 * Where Vault file bytes are kept. The browser sends and fetches them
 * directly, on short-lived signed addresses; they never pass through the
 * database.
 */
export interface FileStorage {
  /** False when no storage is set up: uploads are then refused with a plain message. */
  readonly ready: boolean;
  /** A signed address the browser can PUT the file to, and the headers it must send. */
  uploadUrl(key: string, mimeType: string, size: number): Promise<{ url: string; headers: Record<string, string> }>;
  /** A signed address to fetch the file, shown in the browser (`inline`) or saved. */
  downloadUrl(key: string, fileName: string, mimeType: string, inline: boolean): Promise<string>;
  /** The stored size in bytes, or null when nothing is stored under the key. */
  size(key: string): Promise<number | null>;
  /** Up to `maxBytes` from the start of the file. */
  read(key: string, maxBytes: number): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

export const UPLOAD_SECONDS = 15 * 60;
export const DOWNLOAD_SECONDS = 5 * 60;

/**
 * A Content-Disposition header that keeps any file name, Bangla included:
 * a plain fallback for old clients and the exact name, encoded, for the rest.
 */
export function contentDisposition(fileName: string, inline: boolean): string {
  const plain = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
  const exact = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${plain}"; filename*=UTF-8''${exact}`;
}

/** Used in production until the R2 keys are given. */
export class MissingStorage implements FileStorage {
  readonly ready = false;
  private fail(): never {
    throw new Error('File storage is not set up yet');
  }
  uploadUrl(): Promise<never> {
    return Promise.resolve(this.fail());
  }
  downloadUrl(): Promise<never> {
    return Promise.resolve(this.fail());
  }
  size(): Promise<null> {
    return Promise.resolve(null);
  }
  read(): Promise<never> {
    return Promise.resolve(this.fail());
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}
