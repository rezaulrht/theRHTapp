import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { Account, Category, Entry, MonthReport } from '@/lib/money';
import { addMonths, lastDayOfMonth, monthLabel, monthName, todayInZone } from '@/lib/money-text';
import { MonthView } from './MonthView';

vi.mock('next/navigation', () => ({
  usePathname: () => '/money/month',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const today = todayInZone('Asia/Dhaka');
const month = today.slice(0, 7);
const before = addMonths(month, -1);
const beforeName = monthName(before);

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 0, archived: false, balance: 0 },
  { id: 'cash', name: 'Cash', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 1, archived: false, balance: 0 },
  { id: 'old', name: 'Old wallet', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 2, archived: true, balance: 0 },
];
const categories: Category[] = [
  { id: 'food', name: 'Food', color: 'coral', icon: 'food', sortOrder: 0, isFees: false, archived: false },
  { id: 'travel', name: 'Travel', color: 'sky', icon: 'bus', sortOrder: 1, isFees: false, archived: false },
  { id: 'gifts', name: 'Gifts', color: 'rose', icon: 'gift', sortOrder: 2, isFees: false, archived: true },
];
const entry: Entry = {
  id: 'e1',
  kind: 'expense',
  date: `${month}-01`,
  amount: 20000,
  name: 'Birthday present',
  note: null,
  accountId: 'old',
  toAccountId: null,
  categoryId: 'gifts',
  personId: null,
  loanDirection: null,
  feeOfId: null,
  fee: null,
  createdAt: `${month}-01T04:00:00.000Z`,
};

const full: MonthReport = {
  month,
  spent: { current: 250000, previous: 200000, change: 50000, percent: 25 },
  income: { current: 5000000, previous: 5000000, change: 0, percent: 0 },
  byCategory: [
    { categoryId: 'food', name: 'Food', color: 'coral', icon: 'food', archived: false, spent: 150000, share: 0.6, previous: 100000, budget: 160000, state: 'warning' },
    { categoryId: 'travel', name: 'Travel', color: 'sky', icon: 'bus', archived: false, spent: 80000, share: 0.32, previous: 100000, budget: 50000, state: 'over' },
    { categoryId: 'gifts', name: 'Gifts', color: 'rose', icon: 'gift', archived: true, spent: 20000, share: 0.08, previous: 0, budget: null, state: null },
  ],
  overall: { budget: 300000, state: 'warning' },
  byDayType: [{ dayTypeId: 'workday', name: 'Workday', total: 220000, days: 22, average: 10000 }],
  hasEarlierMonth: true,
};
const empty = (which: string): MonthReport => ({
  month: which,
  spent: { current: 0, previous: null, change: null, percent: null },
  income: { current: 0, previous: null, change: null, percent: null },
  byCategory: [],
  overall: { budget: null, state: null },
  byDayType: [],
  hasEarlierMonth: false,
});

function mockApi(report: MonthReport = full, entries: Entry[] = [entry]) {
  const calls: { key: string; search: URLSearchParams }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const [path = '', query = ''] = url.split('?');
      const key = `${init?.method ?? 'GET'} ${path}`;
      const search = new URLSearchParams(query);
      calls.push({ key, search });
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'GET /api/money/accounts') return json(accounts);
      if (key === 'GET /api/money/categories') return json(categories);
      if (key === 'GET /api/money/entries/names') return json([]);
      if (key === 'GET /api/money/reports/month') {
        const asked = search.get('month');
        return json(asked === month ? report : empty(asked ?? month));
      }
      if (key === 'GET /api/money/entries') return json(search.get('from')?.startsWith(month) ? entries : []);
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderMonth = () =>
  render(
    <SettingsProvider>
      <MonthView />
    </SettingsProvider>,
  );

describe('MonthView', () => {
  it('shows what went out and came in, against the month before', async () => {
    mockApi();
    renderMonth();
    expect(await screen.findByRole('heading', { name: monthLabel(month) })).toBeInTheDocument();
    expect(screen.getByLabelText('৳2,500')).toBeInTheDocument();
    expect(screen.getByText(`25% more than ${beforeName}`)).toBeInTheDocument();
    expect(screen.getByText(`Came in ৳50,000. Same as ${beforeName}`)).toBeInTheDocument();
    expect(screen.getByText('83% of ৳3,000 budget used')).toBeInTheDocument();
  });

  it('breaks spending down by category, with share, change and budget', async () => {
    mockApi();
    renderMonth();
    const list = await screen.findByRole('list', { name: 'Spending by category' });
    const [food, travel, gifts] = within(list).getAllByRole('listitem');

    expect(within(food!).getByText('Food')).toBeInTheDocument();
    expect(within(food!).getByText('৳1,500')).toBeInTheDocument();
    expect(within(food!).getByText('60%')).toBeInTheDocument();
    expect(within(food!).getByText(`৳500 more than ${beforeName}`)).toBeInTheDocument();
    expect(within(food!).getByText('93% of ৳1,600 budget used')).toBeInTheDocument();

    expect(within(travel!).getByText('Over budget by ৳300')).toBeInTheDocument();
    expect(within(travel!).getByText(`৳200 less than ${beforeName}`)).toBeInTheDocument();

    // An archived category keeps its name on the month it was used in.
    expect(within(gifts!).getByText('Gifts')).toBeInTheDocument();
    expect(within(gifts!).getByText('archived')).toBeInTheDocument();
    expect(within(gifts!).queryByText(/budget/)).not.toBeInTheDocument();
  });

  it('says what each kind of day costs', async () => {
    mockApi();
    renderMonth();
    expect(await screen.findByText('Workday: ৳100 a day over 22 days')).toBeInTheDocument();
  });

  it('keeps the names of an archived account and category on old entries', async () => {
    mockApi();
    renderMonth();
    const list = await screen.findByRole('list', { name: 'Entries' });
    expect(within(list).getByText('Birthday present')).toBeInTheDocument();
    expect(within(list).getByText('Old wallet')).toBeInTheDocument();
    expect(within(list).getByText('Gifts')).toBeInTheDocument();
  });

  it('says so when nothing was spent, and when there is no earlier month', async () => {
    mockApi(empty(month), []);
    renderMonth();
    expect(await screen.findByText('Nothing spent this month.')).toBeInTheDocument();
    expect(screen.getByText('No earlier month to compare')).toBeInTheDocument();
    expect(await screen.findByText('Nothing logged this month.')).toBeInTheDocument();
  });

  it('goes back a month, but never past the current one', async () => {
    const calls = mockApi();
    renderMonth();
    await screen.findByRole('heading', { name: monthLabel(month) });
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('heading', { name: monthLabel(before) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.key === 'GET /api/money/entries' &&
            call.search.get('from') === `${before}-01` &&
            call.search.get('to') === lastDayOfMonth(before),
        ),
      ).toBe(true),
    );
  });

  it('filters the entries by account, category and text', async () => {
    const calls = mockApi();
    renderMonth();
    await screen.findByRole('list', { name: 'Entries' });

    await userEvent.selectOptions(screen.getByLabelText('Account'), 'cash');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'food');
    await userEvent.type(screen.getByLabelText('Search'), 'lunch');

    await waitFor(() => {
      const last = calls.filter((call) => call.key === 'GET /api/money/entries').pop()!;
      expect(last.search.get('accountId')).toBe('cash');
      expect(last.search.get('categoryId')).toBe('food');
      expect(last.search.get('q')).toBe('lunch');
    });
  });
});
