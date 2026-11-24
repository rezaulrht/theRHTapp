import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { R2Status } from '@/lib/storage';
import { StorageSettings } from './StorageSettings';

function mockApi(initial: R2Status, failSave?: { status: number; body: unknown }) {
  let status = initial;
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const json = (data: unknown, code = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), { status: code, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /api/storage/r2') return json(status);
      if (key === 'PUT /api/storage/r2') {
        if (failSave) return json(failSave.body, failSave.status);
        const sent = body as { bucket: string; accessKeyId: string };
        status = { configured: true, source: 'settings', bucket: sent.bucket, accessKeyEnd: sent.accessKeyId.slice(-4) };
        return json(undefined, 204);
      }
      if (key === 'DELETE /api/storage/r2') {
        status = { configured: false, source: null, bucket: null, accessKeyEnd: null };
        return json(undefined, 204);
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const none: R2Status = { configured: false, source: null, bucket: null, accessKeyEnd: null };

async function fill() {
  await userEvent.type(await screen.findByLabelText('Account ID'), 'abc123');
  await userEvent.type(screen.getByLabelText('Access key ID'), 'AKIA0000WXYZ');
  await userEvent.type(screen.getByLabelText('Secret access key'), 'top-secret-value');
  await userEvent.type(screen.getByLabelText('Bucket name'), 'my-vault');
}

describe('StorageSettings', () => {
  it('says there is no storage yet when nothing is set up', async () => {
    mockApi(none);
    render(<StorageSettings />);
    expect(await screen.findByText(/No file storage yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('keeps the secret in a password field, sends all four details, clears the form and shows only the end of the key afterwards', async () => {
    const calls = mockApi(none);
    render(<StorageSettings />);
    await fill();
    expect(screen.getByLabelText('Secret access key')).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Test and save' }));

    expect(await screen.findByText(/bucket my-vault, access key ending WXYZ/)).toBeInTheDocument();
    expect(screen.getByText('Tested and saved. Vault uploads now go to this bucket.')).toBeInTheDocument();
    expect(calls.find((call) => call.key === 'PUT /api/storage/r2')?.body).toEqual({
      accountId: 'abc123',
      accessKeyId: 'AKIA0000WXYZ',
      secretAccessKey: 'top-secret-value',
      bucket: 'my-vault',
    });
    expect(screen.getByLabelText('Secret access key')).toHaveValue('');
    expect(document.body).not.toHaveTextContent('top-secret-value');
  });

  it('shows why the keys were refused and keeps what was typed', async () => {
    mockApi(none, { status: 400, body: { message: 'Cloudflare did not accept those keys.', errors: [] } });
    render(<StorageSettings />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Test and save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cloudflare did not accept those keys.');
    expect(screen.getByLabelText('Bucket name')).toHaveValue('my-vault');
  });

  it('removes saved details', async () => {
    mockApi({ configured: true, source: 'settings', bucket: 'my-vault', accessKeyEnd: 'WXYZ' });
    render(<StorageSettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/No file storage yet/)).toBeInTheDocument();
  });

  it('says so when the server has its own storage', async () => {
    mockApi({ configured: true, source: 'env', bucket: 'server-bucket', accessKeyEnd: null });
    render(<StorageSettings />);
    expect(await screen.findByText(/set up on the server \(bucket server-bucket\)/)).toBeInTheDocument();
  });
});
