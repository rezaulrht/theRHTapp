import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { Account, Entry, Person } from '@/lib/money';
import { todayInZone } from '@/lib/money-text';
import { LoansView } from './LoansView';

vi.mock('next/navigation', () => ({
  usePathname: () => '/money/loans',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const today = todayInZone('Asia/Dhaka');

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 0, archived: false, balance: 0 },
  { id: 'cash', name: 'Cash', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 1, archived: false, balance: 0 },
];
const lent: Entry = {
  id: 'l1',
  kind: 'loan',
  date: today,
  amount: 50000,
  name: 'Lent to Rahim',
  note: null,
  accountId: 'cash',
  toAccountId: null,
  categoryId: null,
  personId: 'rahim',
  loanDirection: 'lent',
  feeOfId: null,
  fee: null,
  createdAt: `${today}T04:00:00.000Z`,
};

function mockApi(people: Person[]) {
  const calls: { key: string; body: unknown }[] = [];
  const world = { people: [...people] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'GET /api/money/accounts') return json(accounts);
      if (key === 'GET /api/money/categories') return json([]);
      if (key === 'GET /api/money/people') return json(world.people);
      if (key === 'GET /api/money/people/rahim/history') return json([lent]);
      if (key === 'POST /api/money/people') {
        const made = { id: 'new', name: (body as { name: string }).name, archived: false, owed: 0 };
        world.people = [...world.people, made];
        return json(made, 201);
      }
      if (key === 'POST /api/money/loans') {
        world.people = world.people.map((person) => (person.id === 'rahim' ? { ...person, owed: 30000 } : person));
        return json({ ...lent, id: 'l2', loanDirection: 'repaid_to_me', amount: 20000 }, 201);
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const everyone: Person[] = [
  { id: 'rahim', name: 'Rahim', archived: false, owed: 50000 },
  { id: 'karim', name: 'Karim', archived: false, owed: -120000 },
  { id: 'salma', name: 'Salma', archived: false, owed: 0 },
];

const renderLoans = () =>
  render(
    <SettingsProvider>
      <LoansView />
    </SettingsProvider>,
  );

describe('LoansView', () => {
  it('says who owes whom, in words', async () => {
    mockApi(everyone);
    renderLoans();
    expect(await screen.findByText('Rahim owes you ৳500')).toBeInTheDocument();
    expect(screen.getByText('You owe Karim ৳1,200')).toBeInTheDocument();
    expect(screen.getByText('Settled with Salma')).toBeInTheDocument();
  });

  it('says so when there is nobody yet', async () => {
    mockApi([]);
    renderLoans();
    expect(await screen.findByText(/Nobody here yet/)).toBeInTheDocument();
  });

  it('records a repayment in the right direction, in paisa', async () => {
    const calls = mockApi(everyone);
    renderLoans();
    await userEvent.click(await screen.findByRole('button', { name: 'Record something with Rahim' }));

    const dialog = screen.getByRole('dialog');
    // Rahim owes money, so the likely next thing is that he pays it back.
    expect(within(dialog).getByLabelText('What happened')).toHaveValue('repaid_to_me');
    await userEvent.type(within(dialog).getByLabelText('Amount'), '200');
    await userEvent.selectOptions(within(dialog).getByLabelText('Account'), 'cash');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((call) => call.key === 'POST /api/money/loans')?.body).toEqual({
      personId: 'rahim',
      direction: 'repaid_to_me',
      amount: 20000,
      accountId: 'cash',
      date: today,
    });
    expect(await screen.findByText('Rahim owes you ৳300')).toBeInTheDocument();
  });

  it.each([
    ['karim', 'repaid_by_me'],
    ['salma', 'lent'],
  ])('suggests what is likely for %s: %s', async (id, direction) => {
    mockApi(everyone);
    renderLoans();
    const name = everyone.find((person) => person.id === id)!.name;
    await userEvent.click(await screen.findByRole('button', { name: `Record something with ${name}` }));
    expect(screen.getByLabelText('What happened')).toHaveValue(direction);
  });

  it('refuses an amount that is not money and posts nothing', async () => {
    const calls = mockApi(everyone);
    renderLoans();
    await userEvent.click(await screen.findByRole('button', { name: 'Record something with Rahim' }));
    await userEvent.type(screen.getByLabelText('Amount'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByLabelText('Amount')).toBeInvalid());
    expect(calls.some((call) => call.key === 'POST /api/money/loans')).toBe(false);
  });

  it('shows a person’s history when opened', async () => {
    mockApi(everyone);
    renderLoans();
    await userEvent.click(await screen.findByRole('button', { name: 'Rahim owes you ৳500' }));
    const history = await screen.findByRole('list', { name: 'History with Rahim' });
    expect(within(history).getByText('Lent to Rahim')).toBeInTheDocument();
    expect(within(history).getByText('Cash')).toBeInTheDocument();
  });

  it('adds a person', async () => {
    const calls = mockApi(everyone);
    renderLoans();
    await userEvent.type(await screen.findByLabelText('New person'), 'Nadia');
    await userEvent.click(screen.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByText('Settled with Nadia')).toBeInTheDocument();
    expect(calls.find((call) => call.key === 'POST /api/money/people')?.body).toEqual({ name: 'Nadia' });
  });
});
