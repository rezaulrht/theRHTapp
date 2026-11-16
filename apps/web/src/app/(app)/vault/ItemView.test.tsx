import { defaultSettings } from '@pa/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { VaultField, VaultItem, VaultTag } from '@/lib/vault';
import { ItemView } from './_parts/ItemView';
import { Markdown } from './_parts/Markdown';
import { scheduleText } from './_parts/RemindersPanel';

vi.mock('next/navigation', () => ({
  usePathname: () => '/vault/i/n1',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const base: VaultItem = {
  id: 'n1',
  folderId: 'chapter',
  kind: 'note',
  name: 'Newton answer',
  sortOrder: 0,
  pinned: false,
  body: '# Newton\n\nFirst law.',
  excerpt: null,
  url: null,
  file: null,
  tagIds: ['exam'],
  values: {},
  path: [
    { id: 'physics', name: 'Physics' },
    { id: 'chapter', name: 'Chapter 3' },
  ],
  createdAt: '2026-11-16T00:00:00Z',
  updatedAt: '2026-11-16T00:00:00Z',
};

const tags: VaultTag[] = [
  { id: 'exam', name: 'Exam revision', color: 'coral', count: 3 },
  { id: 'hard', name: 'Hard', color: 'sky', count: 1 },
];
const fields: VaultField[] = [
  { id: 'teacher', name: 'Teacher', type: 'text', choices: [], sortOrder: 0, archived: false },
  { id: 'chapterNo', name: 'Chapter number', type: 'number', choices: [], sortOrder: 1, archived: false },
  { id: 'exam', name: 'Exam date', type: 'date', choices: [], sortOrder: 2, archived: false },
  { id: 'source', name: 'Source', type: 'choice', choices: ['Claude', 'ChatGPT'], sortOrder: 3, archived: false },
  { id: 'origin', name: 'Original chat', type: 'url', choices: [], sortOrder: 4, archived: false },
  { id: 'revised', name: 'Revised', type: 'boolean', choices: [], sortOrder: 5, archived: false },
];

interface Call {
  key: string;
  body: unknown;
}

function mockApi(item: VaultItem) {
  const calls: Call[] = [];
  let current = { ...item };
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
      if (key === `GET /api/vault/items/${item.id}`) return json(current);
      if (key === `PATCH /api/vault/items/${item.id}`) {
        current = { ...current, ...(body as object) };
        return json(current);
      }
      if (key === 'GET /api/vault/tags') return json(tags);
      if (key === 'POST /api/vault/tags') return json({ id: 'new', name: (body as { name: string }).name, color: 'brass', count: 0 }, 201);
      if (key === `PUT /api/vault/items/${item.id}/tags`) {
        current = { ...current, tagIds: (body as { tagIds: string[] }).tagIds, body: null };
        return json(current);
      }
      if (key === 'GET /api/vault/fields') return json(fields);
      if (key === 'PUT /api/vault/values') {
        const value = (body as { value: unknown }).value;
        if (value === 'Mr X') {
          return json({ message: 'Some fields are not valid', errors: [{ path: 'value', message: 'Use shorter text' }] }, 400);
        }
        return json({ fieldId: (body as { fieldId: string }).fieldId, value });
      }
      if (key === 'GET /api/vault/reminders') return json([]);
      if (key === 'POST /api/vault/reminders') return json({ id: 'r1', ...(body as object), body: '', ignoreQuietHours: false, next: null }, 201);
      if (key === `GET /api/vault/files/${item.id}/url`) return json({ url: `https://storage.example.test/${item.id}` });
      if (key === `GET /api/vault/files/${item.id}/text`) return json({ text: '# From a file\n\n- one\n- two' });
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderItem = (id = 'n1') =>
  render(
    <SettingsProvider>
      <ItemView id={id} />
    </SettingsProvider>,
  );

describe('Markdown', () => {
  it('shows an AI answer as it was written: headings, tables and code', () => {
    render(<Markdown text={'## Newton\n\n| Law | Idea |\n|---|---|\n| 1 | Inertia |\n\n```js\nconst f = m * a;\n```\n\nInline `F = ma`.'} />);
    // One level below the page title.
    expect(screen.getByRole('heading', { level: 3, name: 'Newton' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Inertia' })).toBeInTheDocument();
    expect(screen.getByText('const f = m * a;')).toBeInTheDocument();
    expect(screen.getByText('F = ma').tagName).toBe('CODE');
  });

  it('never runs or shows raw HTML, and keeps links safe', () => {
    const { container } = render(<Markdown text={'Hello <script>alert(1)</script> <b>bold</b>\n\n[bad](javascript:alert(1)) [good](https://claude.ai)'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    const good = screen.getByRole('link', { name: 'good' });
    expect(good).toHaveAttribute('target', '_blank');
    expect(good).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.innerHTML).not.toContain('javascript:');
  });
});

describe('ItemView', () => {
  it('reads a note, then edits and saves it', async () => {
    const calls = mockApi(base);
    renderItem();
    expect(await screen.findByRole('heading', { level: 1, name: 'Newton answer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Newton' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(screen.getByRole('navigation', { name: 'Where this is' })).getByRole('link', { name: 'Chapter 3' })).toHaveAttribute(
      'href',
      '/vault/f/chapter',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Write' }));
    const box = screen.getByLabelText('Markdown');
    await userEvent.type(box, '\n\nSecond law.');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'PATCH /api/vault/items/n1')?.body).toEqual({ body: '# Newton\n\nFirst law.\n\nSecond law.' }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('a PDF opens in the app; a slide deck only downloads', async () => {
    mockApi({ ...base, id: 'p1', kind: 'file', name: 'Lecture 3.pdf', body: null, file: { size: 2048, mimeType: 'application/pdf', uploaded: true } });
    const first = renderItem('p1');
    const frame = await screen.findByTitle('Lecture 3.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'https://storage.example.test/p1');
    expect(screen.getByRole('button', { name: 'Open full screen' })).toBeInTheDocument();
    first.unmount();

    mockApi({ ...base, id: 'd1', kind: 'file', name: 'Week 4.pptx', body: null, file: { size: 2048, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', uploaded: true } });
    renderItem('d1');
    expect(await screen.findByText(/does not open in the app/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByTitle('Week 4.pptx')).not.toBeInTheDocument();
  });

  it('a markdown file is shown formatted', async () => {
    mockApi({ ...base, id: 'm1', kind: 'file', name: 'answer.md', body: null, file: { size: 30, mimeType: 'text/markdown', uploaded: true } });
    renderItem('m1');
    expect(await screen.findByRole('heading', { name: 'From a file' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').some((li) => li.textContent === 'two')).toBe(true);
  });

  it('removes a tag and adds a new one', async () => {
    const calls = mockApi(base);
    renderItem();
    const mine = await screen.findByRole('list', { name: 'Tags on this' });
    expect(await within(mine).findByRole('link', { name: 'Exam revision' })).toHaveAttribute('href', '/vault/tags/exam');
    await userEvent.click(screen.getByRole('button', { name: 'Remove the tag Exam revision' }));
    await waitFor(() => expect(calls.find((call) => call.key === 'PUT /api/vault/items/n1/tags')?.body).toEqual({ tagIds: [] }));

    await userEvent.type(screen.getByLabelText('Add a tag'), 'Formula');
    await userEvent.click(within(screen.getByRole('region', { name: 'Tags' })).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(calls.find((call) => call.key === 'POST /api/vault/tags')?.body).toEqual({ name: 'Formula' }));
    await waitFor(() => expect(calls.filter((call) => call.key === 'PUT /api/vault/items/n1/tags').at(-1)?.body).toEqual({ tagIds: ['new'] }));
  });

  it('gives each field type its own control, and shows a refusal beside the field', async () => {
    const calls = mockApi(base);
    renderItem();
    const region = await screen.findByRole('region', { name: 'Fields' });
    await userEvent.type(await within(region).findByLabelText('Teacher'), 'Mr Karim');
    fireEvent.blur(within(region).getByLabelText('Teacher'));
    fireEvent.change(within(region).getByLabelText('Exam date'), { target: { value: '2026-12-01' } });
    await userEvent.selectOptions(within(region).getByLabelText('Source'), 'Claude');
    await userEvent.click(within(region).getByRole('switch', { name: 'Revised' }));

    await waitFor(() =>
      expect(calls.filter((call) => call.key === 'PUT /api/vault/values').map((call) => call.body)).toEqual([
        { fieldId: 'teacher', itemId: 'n1', value: 'Mr Karim' },
        { fieldId: 'exam', itemId: 'n1', value: '2026-12-01' },
        { fieldId: 'source', itemId: 'n1', value: 'Claude' },
        { fieldId: 'revised', itemId: 'n1', value: true },
      ]),
    );

    // Letters in a number box are refused here, and the stored value is left alone.
    const number = within(region).getByLabelText('Chapter number');
    const sent = calls.length;
    fireEvent.change(number, { target: { value: 'not a number' } });
    fireEvent.blur(number);
    expect(await within(region).findByText('Enter a number')).toBeInTheDocument();
    expect(calls.slice(sent).some((call) => call.key === 'PUT /api/vault/values')).toBe(false);
  });

  it('shows the server’s refusal beside the field', async () => {
    mockApi(base);
    renderItem();
    const region = await screen.findByRole('region', { name: 'Fields' });
    await userEvent.type(await within(region).findByLabelText('Teacher'), 'Mr X');
    fireEvent.blur(within(region).getByLabelText('Teacher'));
    expect(await within(region).findByText('Use shorter text')).toBeInTheDocument();
    expect(within(region).getByLabelText('Teacher')).toBeInvalid();
  });

  it('adds a weekly reminder', async () => {
    const calls = mockApi(base);
    renderItem();
    const region = await screen.findByRole('region', { name: 'Reminders' });
    await userEvent.click(within(region).getByRole('button', { name: 'Add a reminder' }));
    await userEvent.clear(within(region).getByLabelText('Reminder'));
    await userEvent.type(within(region).getByLabelText('Reminder'), 'Revise Newton');
    await userEvent.click(within(region).getByRole('switch', { name: 'Every week' }));
    await userEvent.click(within(region).getByRole('checkbox', { name: 'Friday' }));
    await userEvent.click(within(region).getByRole('checkbox', { name: 'Tuesday' }));
    fireEvent.change(within(region).getByLabelText('Time'), { target: { value: '08:00' } });
    await userEvent.click(within(region).getByRole('button', { name: 'Add reminder' }));
    await waitFor(() =>
      expect(calls.find((call) => call.key === 'POST /api/vault/reminders')?.body).toEqual({
        owner: 'item:n1',
        title: 'Revise Newton',
        schedule: { kind: 'weekly', days: [2, 5], time: '08:00' },
        channels: ['push'],
      }),
    );
  });

  it('a reminder needs a day or a date', async () => {
    const calls = mockApi(base);
    renderItem();
    const region = await screen.findByRole('region', { name: 'Reminders' });
    await userEvent.click(within(region).getByRole('button', { name: 'Add a reminder' }));
    await userEvent.click(within(region).getByRole('button', { name: 'Add reminder' }));
    expect(within(region).getByText('Pick a date')).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'POST /api/vault/reminders')).toBe(false);
  });
});

describe('scheduleText', () => {
  it('says when a reminder goes off', () => {
    expect(scheduleText({ kind: 'weekly', days: [5], time: '08:00' }, 'Asia/Dhaka')).toBe('Every Friday at 8:00 am');
    expect(scheduleText({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '21:30' }, 'Asia/Dhaka')).toBe('Every day at 9:30 pm');
    expect(scheduleText({ kind: 'once', at: '2026-12-01T01:00:00Z' }, 'Asia/Dhaka')).toBe('Once, 1 December at 7:00 am');
  });
});
