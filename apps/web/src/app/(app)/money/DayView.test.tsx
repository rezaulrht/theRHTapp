import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { Account, Category, DayReport, Entry, Shortcut, TodayReport } from '@/lib/money';
import { addDays, todayInZone } from '@/lib/money-text';
import { TodayMoney } from '../today/TodayMoney';
import { DayView } from './DayView';

vi.mock('next/navigation', () => ({
  usePathname: () => '/money',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const today = todayInZone('Asia/Dhaka');

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', openingBalance: 0, openingDate: '2026-11-01', sortOrder: 0, archived: false, balance: 4_235_000 },
  { id: 'bkash', name: 'bKash', openingBalance: 0, openingDate: '2026-11-01', sortOrder: 1, archived: false, balance: 312_000 },
  { id: 'cash', name: 'Cash', openingBalance: 0, openingDate: '2026-11-01', sortOrder: 2, archived: false, balance: 184_000 },
  { id: 'old', name: 'Old wallet', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 3, archived: true, balance: 0 },
];
const categories: Category[] = [
  { id: 'travel', name: 'Travel', color: 'sky', icon: 'bus', sortOrder: 0, isFees: false, archived: false },
  { id: 'food', name: 'Food', color: 'coral', icon: 'food', sortOrder: 1, isFees: false, archived: false },
];
const shortcuts: Shortcut[] = [
  { id: 's1', name: 'Office rickshaw', amount: 8000, accountId: 'cash', categoryId: 'travel', sortOrder: 0, usable: true },
  { id: 's2', name: 'Gone', amount: 500, accountId: 'old', categoryId: 'travel', sortOrder: 1, usable: false },
];
const entry = (over: Partial<Entry>): Entry => ({
  id: 'e1',
  kind: 'expense',
  date: today,
  amount: 6000,
  name: 'Bus to campus',
  note: null,
  accountId: 'cash',
  toAccountId: null,
  categoryId: 'travel',
  personId: null,
  loanDirection: null,
  feeOfId: null,
  fee: null,
  createdAt: '2026-11-13T04:00:00.000Z',
  ...over,
});

interface World {
  day: DayReport;
  calls: { key: string; body: unknown }[];
}

/** A small fake back end whose day report the tests can change. */
function mockWorld(initial: Entry[]): World {
  const world: World = {
    day: { date: today, spent: 0, income: 0, entries: initial },
    calls: [],
  };
  const total = () =>
    world.day.entries.filter((e) => e.kind === 'expense').reduce((sum, e) => sum + e.amount, 0);
  world.day.spent = total();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const [path = '', search = ''] = url.split('?');
      const key = `${init?.method ?? 'GET'} ${path}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      world.calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'GET /api/money/accounts') return json(accounts);
      if (key === 'GET /api/money/categories') return json(categories);
      if (key === 'GET /api/money/shortcuts') return json(shortcuts);
      if (key === 'GET /api/money/entries/names') return json([]);
      if (key === 'GET /api/money/reports/day') {
        const date = new URLSearchParams(search).get('date')!;
        return json(date === today ? { ...world.day, spent: total() } : { date, spent: 0, income: 0, entries: [] });
      }
      if (key === 'POST /api/money/shortcuts/s1/use') {
        const made = entry({ id: `u${world.calls.length}`, name: 'Office rickshaw', amount: 8000 });
        world.day.entries = [made, ...world.day.entries];
        return json(made, 201);
      }
      if (key === 'POST /api/money/entries') {
        const made = entry({ id: 'new', name: (body as { name: string }).name, amount: (body as { amount: number }).amount });
        world.day.entries = [made, ...world.day.entries];
        return json(made, 201);
      }
      if (key.startsWith('DELETE /api/money/entries/')) {
        const id = path.split('/').pop();
        world.day.entries = world.day.entries.filter((e) => e.id !== id);
        return json(undefined, 204);
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return world;
}

const renderDay = () =>
  render(
    <SettingsProvider>
      <DayView />
    </SettingsProvider>,
  );
const count = (world: World, key: string) => world.calls.filter((call) => call.key === key).length;

describe('DayView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows each active account’s balance, the day’s total and its entries', async () => {
    mockWorld([entry({}), entry({ id: 'e2', name: 'Lunch at canteen', amount: 14_000, accountId: 'bkash', categoryId: 'food' })]);
    renderDay();

    const balances = await screen.findByRole('list', { name: 'Balances' });
    expect(within(balances).getByText('Bank')).toBeInTheDocument();
    expect(within(balances).getByLabelText('৳42,350')).toBeInTheDocument();
    expect(within(balances).getByLabelText('৳1,840')).toBeInTheDocument();
    // An archived account is not in the strip.
    expect(within(balances).queryByText('Old wallet')).not.toBeInTheDocument();

    expect(screen.getByLabelText('৳200')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Entries' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Lunch at canteen')).toBeInTheDocument();
    expect(within(list).getByText('bKash')).toBeInTheDocument();
  });

  it('says so when nothing is logged', async () => {
    mockWorld([]);
    renderDay();
    expect(await screen.findByText('Nothing logged for this day yet.')).toBeInTheDocument();
  });

  it('records a shortcut with one tap, even when tapped twice quickly', async () => {
    const world = mockWorld([]);
    renderDay();
    const shortcut = await screen.findByRole('button', { name: 'Office rickshaw ৳80' });
    await userEvent.dblClick(shortcut);

    expect(await screen.findByText('Office rickshaw', { selector: '[data-entry-name]' })).toBeInTheDocument();
    expect(count(world, 'POST /api/money/shortcuts/s1/use')).toBe(1);
    // The total followed.
    expect(await screen.findByLabelText('৳80')).toBeInTheDocument();
  });

  it('does not offer a shortcut whose account or category is archived', async () => {
    mockWorld([]);
    renderDay();
    await screen.findByRole('button', { name: 'Office rickshaw ৳80' });
    expect(screen.queryByRole('button', { name: /Gone/ })).not.toBeInTheDocument();
  });

  it('adds an expense through the form and refreshes the day', async () => {
    const world = mockWorld([]);
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '150');
    await userEvent.type(within(dialog).getByLabelText('What was it for?'), 'Lunch');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Lunch', { selector: '[data-entry-name]' })).toBeInTheDocument();
    expect(await screen.findByLabelText('৳150')).toBeInTheDocument();
    expect(count(world, 'GET /api/money/accounts')).toBeGreaterThan(1);
  });

  it('opens an entry for editing when tapped', async () => {
    mockWorld([entry({})]);
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: /Bus to campus/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('What was it for?')).toHaveValue('Bus to campus');
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('asks before deleting, then deletes', async () => {
    const world = mockWorld([entry({})]);
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: /Bus to campus/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(count(world, 'DELETE /api/money/entries/e1')).toBe(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete it' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(count(world, 'DELETE /api/money/entries/e1')).toBe(1);
    expect(await screen.findByText('Nothing logged for this day yet.')).toBeInTheDocument();
  });

  it('cannot go past today, and can step back a day', async () => {
    const world = mockWorld([entry({})]);
    renderDay();
    const next = await screen.findByRole('button', { name: 'Next day' });
    expect(next).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(await screen.findByText('Nothing logged for this day yet.')).toBeInTheDocument();
    expect(world.calls.some((call) => call.key === 'GET /api/money/reports/day')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next day' })).not.toBeDisabled();
    expect(screen.getByLabelText('Day')).toHaveValue(addDays(today, -1));
  });

  it('closes the form with Escape', async () => {
    mockWorld([]);
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('TodayMoney', () => {
  const report = (over: Partial<TodayReport>): TodayReport => ({
    date: '2026-11-13',
    spent: 23_500,
    comparedToSameWeekdayLastWeek: { current: 23_500, previous: 30_000, change: -6_500, percent: -22 },
    balances: [
      { id: 'bank', name: 'Bank', balance: 4_235_000 },
      { id: 'cash', name: 'Cash', balance: 184_000 },
    ],
    ...over,
  });
  const mockToday = (data: TodayReport) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url === '/api/settings' ? defaultSettings : data;
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  const renderToday = () =>
    render(
      <SettingsProvider>
        <TodayMoney />
      </SettingsProvider>,
    );

  it('shows today’s spending, the comparison and balances', async () => {
    mockToday(report({}));
    renderToday();
    expect(await screen.findByLabelText('৳235')).toBeInTheDocument();
    expect(screen.getByText('৳65 less than last Friday')).toBeInTheDocument();
    expect(screen.getByText('Bank')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add expense' })).toHaveAttribute('href', '/money?add=1');
  });

  it('says more when more was spent', async () => {
    mockToday(report({ spent: 30_000, comparedToSameWeekdayLastWeek: { current: 30_000, previous: 23_500, change: 6_500, percent: 28 } }));
    renderToday();
    expect(await screen.findByText('৳65 more than last Friday')).toBeInTheDocument();
  });

  it('leaves the comparison out when there is no earlier day', async () => {
    mockToday(report({ comparedToSameWeekdayLastWeek: { current: 23_500, previous: null, change: null, percent: null } }));
    renderToday();
    await screen.findByLabelText('৳235');
    expect(screen.queryByText(/than last/)).not.toBeInTheDocument();
  });
});
