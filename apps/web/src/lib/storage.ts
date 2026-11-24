import { api } from './api';

export interface R2Status {
  configured: boolean;
  /** Where the storage in use gets its keys: saved in Settings, the server's own, or nowhere. */
  source: 'settings' | 'env' | null;
  bucket: string | null;
  /** The last four characters of the access key id, to recognise a saved setup. Never a secret. */
  accessKeyEnd: string | null;
}

export interface R2Details {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Where Vault files are kept. The keys are tested, then stored encrypted on the server, and never sent back. */
export const storage = {
  status: () => api<R2Status>('/storage/r2'),
  save: (details: R2Details) => api('/storage/r2', { method: 'PUT', json: details }),
  remove: () => api('/storage/r2', { method: 'DELETE' }),
};
