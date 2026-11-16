import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { VaultField, VaultTag } from '@/lib/vault';
import { VaultSettings } from './VaultSettings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/vault',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const fields: VaultField[] = [
  { id: 'teacher', name: 'Teacher', type: 'text', choices: [], sortOrder: 0, archived: false },
  { id: 'source', name: 'Source', type: 'choice', choices: ['Claude', 'ChatGPT'], sortOrder: 1, archived: false },
];
const tags: VaultTag[] = [{ id: 'exam', name: 'Exam revision', color: 'coral', count: 3 }];

function mockApi() {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0]!;
      const key = `${init?.method ?? 'GET'} ${path}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'PATCH /api/settings') return json({ ...defaultSettings, ...(body as object) });
      if (key === 'GET /api/vault/fields') return json(fields);
      if (key === 'GET /api/vault/tags') return json(tags);
      if (key === 'GET /api/vault/storage') return json({ used: 1.2 * 1024 ** 3, allowance: 10 * 1024 ** 3, files: 48 });
      if (key === 'POST /api/vault/fields') return json({ id: 'new', ...(body as object), sortOrder: 2, archived: false }, 201);
      if (key.startsWith('PATCH /api/vault/fields/')) return json({ ...fields[1], ...(body as object) });
      if (key === 'DELETE /api/vault/tags/exam') return json(undefined, 204);
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderSettings = () =>
  render(
    <SettingsProvider>
      <VaultSettings />
    </SettingsProvider>,
  );
const bodyOf = (calls: { key: string; body: unknown }[], key: string) => calls.find((call) => call.key === key)?.body;

describe('Vault settings', () => {
  it('adds a choice field with its choices, one per line', async () => {
    const calls = mockApi();
    renderSettings();
    const add = await screen.findByRole('form', { name: 'Add a field' });
    await userEvent.type(within(add).getByLabelText('Name'), 'Difficulty');
    await userEvent.selectOptions(within(add).getByLabelText('Type'), 'choice');
    await userEvent.type(within(add).getByLabelText('Choices, one per line'), 'Easy\n Hard \n\nVery hard');
    await userEvent.click(within(add).getByRole('button', { name: 'Add field' }));
    await waitFor(() =>
      expect(bodyOf(calls, 'POST /api/vault/fields')).toEqual({ name: 'Difficulty', type: 'choice', choices: ['Easy', 'Hard', 'Very hard'] }),
    );
  });

  it('shows a field’s type but does not let it be changed', async () => {
    const calls = mockApi();
    renderSettings();
    const row = await screen.findByRole('form', { name: 'Source' });
    expect(within(row).getByText('Choice from a list')).toBeInTheDocument();
    expect(within(row).queryByLabelText('Type')).not.toBeInTheDocument();
    await userEvent.type(within(row).getByLabelText('Choices, one per line'), '\nGemini');
    await userEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(bodyOf(calls, 'PATCH /api/vault/fields/source')).toEqual({ name: 'Source', choices: ['Claude', 'ChatGPT', 'Gemini'] }),
    );
  });

  it('asks before deleting a tag, saying the items stay', async () => {
    const calls = mockApi();
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Exam revision' }));
    expect(screen.getByText(/It comes off 3 items; the items stay\./)).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'DELETE /api/vault/tags/exam')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(calls.some((call) => call.key === 'DELETE /api/vault/tags/exam')).toBe(true));
  });

  it('sends only the limits that changed', async () => {
    const calls = mockApi();
    renderSettings();
    const box = await screen.findByLabelText('Keep deleted things for (days)');
    await userEvent.clear(box);
    await userEvent.type(box, '60');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodyOf(calls, 'PATCH /api/settings')).toEqual({ 'vault.trashDays': 60 }));
  });

  it('shows the space used against the free allowance', async () => {
    mockApi();
    renderSettings();
    expect(await screen.findByText('1.2 GB of 10 GB used')).toBeInTheDocument();
    expect(screen.getByText(/48 files, those in the trash included/)).toBeInTheDocument();
  });
});
