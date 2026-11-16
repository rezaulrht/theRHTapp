import { defaultSettings } from '@pa/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { FolderContents, VaultFolder, VaultItem } from '@/lib/vault';
import { TodayVault } from '../today/TodayVault';
import { FolderView } from './_parts/FolderView';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/vault/f/chapter',
  useRouter: () => ({ replace: vi.fn(), push }),
}));

const folder = (id: string, name: string, path: { id: string; name: string }[], parentId: string | null = null): VaultFolder => ({
  id,
  parentId,
  name,
  sortOrder: 0,
  pinned: false,
  path,
  values: {},
  updatedAt: '2026-11-16T00:00:00Z',
});
const item = (over: Partial<VaultItem>): VaultItem => ({
  id: 'n1',
  folderId: 'chapter',
  kind: 'note',
  name: 'Newton answer',
  sortOrder: 0,
  pinned: false,
  body: null,
  excerpt: '# Newton',
  url: null,
  file: null,
  tagIds: [],
  values: {},
  path: [],
  createdAt: '2026-11-16T00:00:00Z',
  updatedAt: '2026-11-16T00:00:00Z',
  ...over,
});

const physicsPath = [{ id: 'physics', name: 'Physics' }];
const chapterPath = [...physicsPath, { id: 'chapter', name: 'Chapter 3' }];

const contents: Record<string, FolderContents> = {
  chapter: {
    folder: folder('chapter', 'Chapter 3', chapterPath, 'physics'),
    folders: [folder('topic', 'Topic 1', [...chapterPath, { id: 'topic', name: 'Topic 1' }], 'chapter'), folder('topic2', 'Topic 2', [...chapterPath, { id: 'topic2', name: 'Topic 2' }], 'chapter')],
    items: [item({}), item({ id: 'f1', kind: 'file', name: 'slides.pdf', excerpt: null, file: { size: 2048, mimeType: 'application/pdf', uploaded: true } })],
    todos: [{ id: 't1', folderId: 'chapter', text: 'Past papers', dueDate: null, remind: false, done: false, sortOrder: 0 }],
  },
  root: {
    folder: null,
    folders: [folder('physics', 'Physics', physicsPath), folder('work', 'Work', [{ id: 'work', name: 'Work' }])],
    items: [],
    todos: [],
  },
  physics: {
    folder: folder('physics', 'Physics', physicsPath),
    folders: [folder('chapter', 'Chapter 3', chapterPath, 'physics')],
    items: [],
    todos: [],
  },
  work: { folder: folder('work', 'Work', [{ id: 'work', name: 'Work' }]), folders: [], items: [], todos: [] },
};

interface Call {
  key: string;
  url: string;
  body: unknown;
}

function mockApi(options: { failUploadOf?: string; holdUploads?: Promise<void> } = {}) {
  const calls: Call[] = [];
  let uploads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0]!;
      const key = `${init?.method ?? 'GET'} ${path}`;
      const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : init?.body;
      calls.push({ key, url, body });
      const json = (data: unknown, status = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

      if (key === 'GET /api/settings') return json({ ...defaultSettings, 'vault.maxFileMb': 1 });
      if (key === 'GET /api/vault/fields') return json([]);
      if (key.startsWith('GET /api/vault/folders/')) return json(contents[path.split('/').pop()!]);
      if (key === 'POST /api/vault/folders') return json(folder('new', (body as { name: string }).name, []), 201);
      if (key === 'POST /api/vault/files') {
        const name = (body as { name: string }).name;
        uploads += 1;
        return json({ item: item({ id: `up${uploads}`, kind: 'file', name }), upload: { url: `https://storage.example.test/${encodeURIComponent(name)}`, headers: { 'Content-Type': 'application/pdf' } } }, 201);
      }
      if (key.startsWith('PUT https://storage.example.test/')) {
        if (options.holdUploads) await options.holdUploads;
        return new Response(null, { status: url.includes(encodeURIComponent(options.failUploadOf ?? '\u0000')) ? 403 : 200 });
      }
      if (key.startsWith('POST /api/vault/files/') && key.endsWith('/complete')) return json(item({ kind: 'file' }), 201);
      if (key === 'POST /api/vault/move') return json(undefined, 204);
      if (key.startsWith('DELETE /api/vault/')) return json(undefined, 204);
      if (key.startsWith('POST /api/vault/trash/')) return json(undefined, 204);
      if (key === 'POST /api/vault/folders/chapter/todos') return json({ id: 't2', folderId: 'chapter', ...(body as object), done: false, sortOrder: 1 }, 201);
      if (key.startsWith('PATCH /api/vault/todos/')) return json({ ...contents.chapter!.todos[0], done: true });
      if (key === 'GET /api/vault/today') {
        return json({
          pinned: { folders: [folder('physics', 'Physics', physicsPath)], items: [] },
          upcoming: [{ date: '2026-11-18', kind: 'todo', title: 'Lab report', at: null, done: false, link: '/vault/f/chapter' }],
        });
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderFolder = (id = 'chapter') =>
  render(
    <SettingsProvider>
      <FolderView id={id} />
    </SettingsProvider>,
  );
const pdf = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

describe('Vault folder view', () => {
  beforeEach(() => push.mockReset());

  it('shows where the folder is, then its folders, items and to-dos', async () => {
    mockApi();
    renderFolder();
    expect(await screen.findByRole('heading', { level: 1, name: 'Chapter 3' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Where this is' });
    expect(within(crumbs).getByRole('link', { name: 'Vault' })).toHaveAttribute('href', '/vault');
    expect(within(crumbs).getByRole('link', { name: 'Physics' })).toHaveAttribute('href', '/vault/f/physics');

    const list = screen.getByRole('list', { name: 'In this folder' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Topic 1', 'Topic 2', 'Newton answerNote', 'slides.pdfPDF · 2 KB']);
    expect(links[0]).toHaveAttribute('href', '/vault/f/topic');
    expect(links[2]).toHaveAttribute('href', '/vault/i/n1');
    expect(within(screen.getByRole('list', { name: 'To-do list' })).getByText('Past papers')).toBeInTheDocument();
  });

  it('makes a folder inside this one', async () => {
    const calls = mockApi();
    renderFolder();
    await userEvent.click(await screen.findByRole('button', { name: 'New folder' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Topic 3');
    await userEvent.click(screen.getByRole('button', { name: 'Make folder' }));
    await waitFor(() => expect(calls.find((call) => call.key === 'POST /api/vault/folders')?.body).toEqual({ parentId: 'chapter', name: 'Topic 3' }));
  });

  it('a new note opens for writing', async () => {
    mockApi();
    renderFolder();
    await userEvent.click(await screen.findByRole('button', { name: 'New note' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Kepler');
    // The server answers with the new note; the page then opens it for writing.
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(item({ id: 'k1', name: 'Kepler' })), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await userEvent.click(screen.getByRole('button', { name: 'Make note' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vault/i/k1?edit=1'));
  });

  it('uploads dropped files side by side, each straight to its address, one failure on its own', async () => {
    const calls = mockApi({ failUploadOf: 'b.pdf' });
    renderFolder();
    const list = await screen.findByRole('list', { name: 'In this folder' });
    fireEvent.drop(list, { dataTransfer: { files: [pdf('a.pdf'), pdf('b.pdf')], types: ['Files'] } });

    const uploads = await screen.findByRole('region', { name: 'Uploads' });
    await waitFor(() => expect(within(uploads).getByText(/^Uploaded/)).toBeInTheDocument());
    expect(within(uploads).getByText(/Not uploaded: The upload was refused \(403\)/)).toBeInTheDocument();
    const starts = calls.filter((call) => call.key === 'POST /api/vault/files').map((call) => call.body);
    expect(starts).toEqual([
      { folderId: 'chapter', name: 'a.pdf', size: 10, mimeType: 'application/pdf' },
      { folderId: 'chapter', name: 'b.pdf', size: 10, mimeType: 'application/pdf' },
    ]);
    const puts = calls.filter((call) => call.key.startsWith('PUT '));
    expect(puts).toHaveLength(2);
    expect(puts[0]!.body).toBeInstanceOf(File);
    // Only the file that arrived is confirmed.
    expect(calls.filter((call) => call.key.endsWith('/complete'))).toHaveLength(1);
  });

  it('refuses a file over the limit before sending any of it', async () => {
    const calls = mockApi();
    renderFolder();
    const input = await screen.findByLabelText('Choose files to upload');
    await userEvent.upload(input, pdf('huge.pdf', 1024 ** 2 + 1));
    expect(await screen.findByText('Not uploaded: Larger than the 1 MB limit')).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'POST /api/vault/files')).toBe(false);
  });

  it('moves selected things, never offering a selected folder as the place', async () => {
    const calls = mockApi();
    renderFolder();
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Topic 1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Newton answer' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));

    const sheet = screen.getByRole('dialog');
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Physics' }));
    // Inside Physics: Chapter 3 is offered, but it is where things are now.
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Chapter 3' }));
    const target = await within(sheet).findByRole('button', { name: 'Move into Chapter 3' });
    expect(target).toBeDisabled();
    expect(within(sheet).queryByRole('button', { name: 'Topic 1' })).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: '‹ Up' }));
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Move into Physics' }));

    await waitFor(() =>
      expect(calls.find((call) => call.key === 'POST /api/vault/move')?.body).toEqual({ folderIds: ['topic'], itemIds: ['n1'], targetId: 'physics' }),
    );
    expect(await screen.findByText('2 moved.')).toBeInTheDocument();
  });

  it('deletes selected things to the trash, with an undo', async () => {
    const calls = mockApi();
    renderFolder();
    await userEvent.click(await screen.findByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select slides.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(await screen.findByText('1 moved to the trash.')).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'DELETE /api/vault/items/f1')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(calls.some((call) => call.key === 'POST /api/vault/trash/f1/restore')).toBe(true));
  });

  it('ticks a to-do and adds one with a date', async () => {
    const calls = mockApi();
    renderFolder();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Done: Past papers' }));
    await waitFor(() => expect(calls.find((call) => call.key === 'PATCH /api/vault/todos/t1')?.body).toEqual({ done: true }));

    await userEvent.type(screen.getByLabelText('New to-do'), 'Lab report');
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-11-20' } });
    await userEvent.click(screen.getByRole('switch', { name: 'Remind me that morning' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'POST /api/vault/folders/chapter/todos')?.body).toEqual({ text: 'Lab report', dueDate: '2026-11-20', remind: true }),
    );
  });

  it('the top level invites a first folder when empty', async () => {
    mockApi();
    const full = contents.root!;
    contents.root = { folder: null, folders: [], items: [], todos: [] };
    renderFolder('root');
    expect(await screen.findByText('Nothing here yet. Make a folder for a subject, or for work.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Vault' })).toBeInTheDocument();
    contents.root = full;
  });
});

describe('TodayVault', () => {
  it('shows pins and what is coming up', async () => {
    mockApi();
    render(
      <SettingsProvider>
        <TodayVault />
      </SettingsProvider>,
    );
    const pins = await screen.findByRole('list', { name: 'Pinned in the Vault' });
    expect(within(pins).getByRole('link', { name: 'Physics' })).toHaveAttribute('href', '/vault/f/physics');
    const coming = screen.getByRole('list', { name: 'Coming up in the Vault' });
    expect(within(coming).getByRole('link', { name: /Lab report/ })).toHaveAttribute('href', '/vault/f/chapter');
  });
});
