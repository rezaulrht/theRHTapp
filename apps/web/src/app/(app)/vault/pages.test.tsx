import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import { todayInZone } from '@/lib/money-text';
import type { CalendarEntry, TrashEntry, VaultItem } from '@/lib/vault';
import { CalendarView, monthGrid } from './calendar/CalendarView';
import { SearchView } from './search/SearchView';
import { TagView } from './tags/[id]/TagView';
import { TrashView } from './trash/TrashView';

let query = 'gravity';
vi.mock('next/navigation', () => ({
  usePathname: () => '/vault',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query ? `q=${encodeURIComponent(query)}` : ''),
}));

const item = (over: Partial<VaultItem>): VaultItem => ({
  id: 'n1',
  folderId: 'chapter',
  kind: 'note',
  name: 'Answer 1',
  sortOrder: 0,
  pinned: false,
  body: null,
  excerpt: null,
  url: null,
  file: null,
  tagIds: [],
  values: {},
  path: [
    { id: 'physics', name: 'Physics' },
    { id: 'chapter', name: 'Chapter 3' },
  ],
  createdAt: '2026-11-16T00:00:00Z',
  updatedAt: '2026-11-16T00:00:00Z',
  ...over,
});

const today = todayInZone('Asia/Dhaka');
const month = today.slice(0, 7);

function mockApi(answers: Record<string, unknown>) {
  const calls: { key: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0]!;
      const key = `${init?.method ?? 'GET'} ${path}`;
      calls.push({ key, url });
      const json = (data: unknown, status = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key in answers) {
        const answer = answers[key];
        return typeof answer === 'function' ? json((answer as () => unknown)()) : json(answer, answer === undefined ? 204 : 200);
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const withSettings = (node: React.ReactNode) => render(<SettingsProvider>{node}</SettingsProvider>);

describe('search', () => {
  it('lists folders and items with where they are and why they matched', async () => {
    query = 'gravity';
    const calls = mockApi({
      'GET /api/vault/search': {
        folders: [
          {
            id: 'mock',
            parentId: 'physics',
            name: 'Gravity papers',
            sortOrder: 0,
            pinned: false,
            path: [
              { id: 'physics', name: 'Physics' },
              { id: 'mock', name: 'Gravity papers' },
            ],
            values: {},
            updatedAt: '',
            matched: 'name',
          },
        ],
        items: [{ ...item({}), matched: 'note' }, { ...item({ id: 'l1', kind: 'link', name: 'The chat', url: 'https://claude.ai/x', path: [] }), matched: 'link' }],
      },
    });
    withSettings(<SearchView />);
    const results = await screen.findByRole('list', { name: 'Results' });
    const rows = within(results).getAllByRole('link');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('href', '/vault/f/mock');
    expect(rows[0]).toHaveTextContent('Gravity papers');
    expect(rows[0]).toHaveTextContent('Physics');
    expect(rows[1]).toHaveTextContent('Physics › Chapter 3 · Note');
    expect(rows[1]).toHaveTextContent('In the note');
    expect(rows[2]).toHaveTextContent('Top level · claude.ai');
    expect(calls.find((call) => call.key === 'GET /api/vault/search')!.url).toBe('/api/vault/search?q=gravity');
  });

  it('says plainly when nothing matches, and that file contents are not searched', async () => {
    query = 'নেই';
    mockApi({ 'GET /api/vault/search': { folders: [], items: [] } });
    withSettings(<SearchView />);
    expect(await screen.findByText(/Nothing matches\. File contents/)).toBeInTheDocument();
  });
});

describe('tag page', () => {
  it('lists everything with the tag and where each is', async () => {
    mockApi({
      'GET /api/vault/tags/exam/items': { tag: { id: 'exam', name: 'Exam revision', color: 'coral', count: 2 }, items: [item({}), item({ id: 'n2', name: 'Kepler', path: [{ id: 'rev', name: 'Revision' }] })] },
    });
    withSettings(<TagView id="exam" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Exam revision' })).toBeInTheDocument();
    const links = within(screen.getByRole('list', { name: 'Tagged' })).getAllByRole('link');
    expect(links[1]).toHaveTextContent('Revision · Note');
  });
});

describe('calendar', () => {
  it('builds whole weeks from Saturday to Friday', () => {
    const days = monthGrid('2026-11');
    // 1 November 2026 is a Sunday, so the grid starts on Saturday 31 October.
    expect(days[0]).toBe('2026-10-31');
    expect(days.length % 7).toBe(0);
    expect(days.at(-1)).toBe('2026-12-04');
  });

  it('puts entries on their days and lists the month, each a link', async () => {
    const entries: CalendarEntry[] = [
      { date: `${month}-10`, kind: 'todo', title: 'Lab report', at: null, done: false, link: '/vault/f/chapter' },
      { date: `${month}-12`, kind: 'field', title: 'Exam date: Physics', at: null, done: false, link: '/vault/f/physics' },
      { date: `${month}-12`, kind: 'reminder', title: 'Revise', at: `${month}-12T02:00:00Z`, done: false, link: '/vault/i/n1' },
    ];
    const calls = mockApi({ 'GET /api/vault/calendar': entries });
    withSettings(<CalendarView />);
    const list = await screen.findByRole('list', { name: 'Entries' });
    expect(within(list).getByRole('link', { name: /Lab report/ })).toHaveAttribute('href', '/vault/f/chapter');
    expect(within(list).getByRole('link', { name: /Revise.*8:00 am/ })).toHaveAttribute('href', '/vault/i/n1');
    const grid = monthGrid(month);
    expect(calls.find((call) => call.key === 'GET /api/vault/calendar')!.url).toBe(`/api/vault/calendar?from=${grid[0]}&to=${grid.at(-1)}`);

    const twelfth = screen.getByRole('gridcell', { name: /, 2 entries$/ });
    await userEvent.click(twelfth);
    const picked = screen.getByRole('list', { name: 'Entries' });
    expect(within(picked).queryByText('Lab report')).not.toBeInTheDocument();
    expect(within(picked).getByText('Exam date: Physics')).toBeInTheDocument();
  });

  it('goes to the next month', async () => {
    const calls = mockApi({ 'GET /api/vault/calendar': [] });
    withSettings(<CalendarView />);
    expect(await screen.findByText('Nothing this month.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(calls.filter((call) => call.key === 'GET /api/vault/calendar')).toHaveLength(2));
  });
});

describe('trash', () => {
  const entries: TrashEntry[] = [
    { id: 'chapter', kind: 'folder', name: 'Chapter 3', trashedAt: '2026-11-16T03:00:00Z', removeAt: '2026-12-16T03:00:00Z', folders: 1, items: 2 },
    { id: 'n1', kind: 'note', name: 'Old note', trashedAt: '2026-11-15T03:00:00Z', removeAt: '2026-12-15T03:00:00Z', folders: 0, items: 0 },
  ];

  it('lists what is there and when it goes, and restores', async () => {
    let list = entries;
    const calls = mockApi({
      'GET /api/vault/trash': () => list,
      'POST /api/vault/trash/n1/restore': undefined,
    });
    withSettings(<TrashView />);
    const shown = await screen.findByRole('list', { name: 'In the trash' });
    expect(within(shown).getByText('1 folder and 2 items inside · Removed for good on 16 December')).toBeInTheDocument();
    list = [entries[0]!];
    await userEvent.click(screen.getByRole('button', { name: 'Restore Old note' }));
    expect(await screen.findByText('Old note is back.')).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'POST /api/vault/trash/n1/restore')).toBe(true);
  });

  it('asks before emptying, saying it cannot be undone', async () => {
    let list = entries;
    const calls = mockApi({
      'GET /api/vault/trash': () => list,
      'DELETE /api/vault/trash': () => ({ left: 0 }),
    });
    withSettings(<TrashView />);
    await userEvent.click(await screen.findByRole('button', { name: 'Empty trash' }));
    expect(screen.getByText(/This cannot be undone\./)).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'DELETE /api/vault/trash')).toBe(false);
    list = [];
    await userEvent.click(screen.getByRole('button', { name: 'Yes, empty the trash' }));
    expect(await screen.findAllByText('The trash is empty.')).not.toHaveLength(0);
  });
});
