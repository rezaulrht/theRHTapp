import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssistantStatus } from '@/lib/ai';
import { AssistantSettings } from './AssistantSettings';

function mockApi(initial: AssistantStatus, failSave?: { status: number; body: unknown }) {
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
      if (key === 'GET /api/ai/status') return json(status);
      if (key === 'PUT /api/ai/key') {
        if (failSave) return json(failSave.body, failSave.status);
        status = { enabled: true, source: 'settings', hint: String((body as { key: string }).key).slice(-4) };
        return json(undefined, 204);
      }
      if (key === 'DELETE /api/ai/key') {
        status = { enabled: false, source: null, hint: null };
        return json(undefined, 204);
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

describe('AssistantSettings', () => {
  it('says the assistant is off when there is no key', async () => {
    mockApi({ enabled: false, source: null, hint: null });
    render(<AssistantSettings />);
    expect(await screen.findByText('No key yet, so the assistant is off.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove key' })).not.toBeInTheDocument();
  });

  it('saves a key, clears the box, and shows only the last four characters afterwards', async () => {
    const calls = mockApi({ enabled: false, source: null, hint: null });
    render(<AssistantSettings />);
    const field = await screen.findByLabelText('DeepSeek API key');
    expect(field).toHaveAttribute('type', 'password');

    await userEvent.type(field, 'sk-secret-0123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));

    expect(await screen.findByText('A key is saved here, ending in 6789. The assistant is on.')).toBeInTheDocument();
    expect(screen.getByText('Key saved.')).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(calls.find((call) => call.key === 'PUT /api/ai/key')?.body).toEqual({ key: 'sk-secret-0123456789' });
    expect(document.body).not.toHaveTextContent('sk-secret-0123456789');
  });

  it('removes a saved key', async () => {
    mockApi({ enabled: true, source: 'settings', hint: 'abcd' });
    render(<AssistantSettings />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove key' }));
    expect(await screen.findByText('No key yet, so the assistant is off.')).toBeInTheDocument();
    expect(screen.getByText('Key removed.')).toBeInTheDocument();
  });

  it('says so when the server has its own key', async () => {
    mockApi({ enabled: true, source: 'env', hint: null });
    render(<AssistantSettings />);
    expect(await screen.findByText(/The server has a key of its own/)).toBeInTheDocument();
  });

  it('shows what the server did not like about a key', async () => {
    mockApi(
      { enabled: false, source: null, hint: null },
      { status: 400, body: { message: 'Some values are not valid', errors: [{ path: 'key', message: 'That does not look like a key' }] } },
    );
    render(<AssistantSettings />);
    await userEvent.type(await screen.findByLabelText('DeepSeek API key'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That does not look like a key');
  });
});
