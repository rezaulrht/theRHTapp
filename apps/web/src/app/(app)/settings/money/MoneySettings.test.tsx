import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { Account, Budget, Category, Person, Shortcut } from '@/lib/money';
import { todayInZone } from '@/lib/money-text';
import { MoneySettings } from './MoneySettings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/money',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const today = todayInZone('Asia/Dhaka');

interface World {
  accounts: Account[];
  categories: Category[];
  shortcuts: Shortcut[];
  budgets: Budget[];
  people: Person[];
  calls: { key: string; body: unknown }[];
}

type Override = (body: unknown) => { status: number; body?: unknown };

function mockWorld(overrides: Record<string, Override> = {}): World {
  const world: World = {
    accounts: [
      { id: 'bank', name: 'Bank', openingBalance: 5_000_000, openingDate: '2026-11-01', sortOrder: 0, archived: false, balance: 5_000_000 },
      { id: 'cash', name: 'Cash', openingBalance: 100_000, openingDate: '2026-11-01', sortOrder: 1, archived: false, balance: 100_000 },
    ],
    categories: [
      { id: 'food', name: 'Food', color: 'coral', icon: 'food', sortOrder: 0, isFees: false, archived: false },
      { id: 'travel', name: 'Travel', color: 'sky', icon: 'bus', sortOrder: 1, isFees: false, archived: false },
      { id: 'fees', name: 'Fees', color: 'sage', icon: 'fee', sortOrder: 2, isFees: true, archived: false },
    ],
    shortcuts: [
      { id: 's1', name: 'Office rickshaw', amount: 8000, accountId: 'cash', categoryId: 'travel', sortOrder: 0, usable: true },
    ],
    budgets: [
      { categoryId: 'food', amount: 600_000 },
      { categoryId: null, amount: 2_000_000 },
    ],
    people: [{ id: 'rahim', name: 'Rahim', archived: false, owed: 0 }],
    calls: [],
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0]!;
      const key = `${init?.method ?? 'GET'} ${path}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      world.calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      const override = overrides[key];
      if (override) {
        const answer = override(body);
        return json(answer.body, answer.status);
      }
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'PATCH /api/settings') return json({ ...defaultSettings, ...(body as object) });
      if (key === 'GET /api/money/accounts') return json(world.accounts);
      if (key === 'GET /api/money/categories') return json(world.categories);
      if (key === 'GET /api/money/shortcuts') return json(world.shortcuts);
      if (key === 'GET /api/money/budgets') return json(world.budgets);
      if (key === 'GET /api/money/people') return json(world.people);
      if (key === 'POST /api/money/accounts') {
        const input = body as { name: string; openingBalance: number; openingDate: string };
        const made: Account = { id: 'new', ...input, sortOrder: 9, archived: false, balance: input.openingBalance };
        world.accounts = [...world.accounts, made];
        return json(made, 201);
      }
      if (key.startsWith('PATCH /api/money/accounts/')) {
        const id = path.split('/').pop();
        world.accounts = world.accounts.map((account) =>
          account.id === id ? { ...account, ...(body as Partial<Account>) } : account,
        );
        return json(world.accounts.find((account) => account.id === id));
      }
      if (key === 'POST /api/money/accounts/reorder') {
        const ids = (body as { ids: string[] }).ids;
        world.accounts = ids.map((id) => world.accounts.find((account) => account.id === id)!);
        return json(undefined, 204);
      }
      if (key === 'POST /api/money/categories/food/merge') {
        world.categories = world.categories.filter((category) => category.id !== 'food');
        return json(undefined, 204);
      }
      if (key === 'PUT /api/money/budgets') {
        const input = body as Budget;
        world.budgets = world.budgets.filter((budget) => budget.categoryId !== input.categoryId);
        if (input.amount > 0) world.budgets.push(input);
        return json(undefined, 204);
      }
      if (key === 'DELETE /api/money/shortcuts/s1') {
        world.shortcuts = [];
        return json(undefined, 204);
      }
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return world;
}

const renderSettings = () =>
  render(
    <SettingsProvider>
      <MoneySettings />
    </SettingsProvider>,
  );
const section = async (name: string) => screen.findByRole('region', { name });
const bodyOf = (world: World, key: string) => world.calls.find((call) => call.key === key)?.body;

describe('MoneySettings', () => {
  it('adds an account, sending paisa', async () => {
    const world = mockWorld();
    renderSettings();
    const accounts = await section('Accounts');
    const add = within(accounts).getByRole('form', { name: 'Add an account' });
    await userEvent.type(within(add).getByLabelText('Name'), 'Savings');
    await userEvent.type(within(add).getByLabelText('Opening balance'), '15,000');
    await userEvent.click(within(add).getByRole('button', { name: 'Add account' }));

    await waitFor(() =>
      expect(bodyOf(world, 'POST /api/money/accounts')).toEqual({
        name: 'Savings',
        openingBalance: 1_500_000,
        openingDate: today,
      }),
    );
    expect(await within(accounts).findByDisplayValue('Savings')).toBeInTheDocument();
  });

  it('shows a server error beside the field it names', async () => {
    mockWorld({
      'POST /api/money/accounts': () => ({
        status: 400,
        body: { message: 'Check the form', errors: [{ path: 'name', message: 'That name is already used' }] },
      }),
    });
    renderSettings();
    const add = within(await section('Accounts')).getByRole('form', { name: 'Add an account' });
    await userEvent.type(within(add).getByLabelText('Name'), 'Bank');
    await userEvent.type(within(add).getByLabelText('Opening balance'), '0');
    await userEvent.click(within(add).getByRole('button', { name: 'Add account' }));

    expect(await within(add).findByText('That name is already used')).toBeInTheDocument();
    expect(within(add).getByLabelText('Name')).toBeInvalid();
  });

  it('renames an account and changes its opening balance', async () => {
    const world = mockWorld();
    renderSettings();
    const row = within(await section('Accounts')).getByRole('form', { name: 'Cash' });
    await userEvent.clear(within(row).getByLabelText('Name'));
    await userEvent.type(within(row).getByLabelText('Name'), 'Wallet');
    await userEvent.clear(within(row).getByLabelText('Opening balance'));
    await userEvent.type(within(row).getByLabelText('Opening balance'), '1250.50');
    await userEvent.click(within(row).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bodyOf(world, 'PATCH /api/money/accounts/cash')).toEqual({
        name: 'Wallet',
        openingBalance: 125_050,
        openingDate: '2026-11-01',
      }),
    );
  });

  it('asks before archiving, then lists the account under Archived', async () => {
    const world = mockWorld();
    renderSettings();
    const accounts = await section('Accounts');
    await userEvent.click(within(accounts).getByRole('button', { name: 'Archive Cash' }));
    // Nothing is sent until the owner confirms.
    expect(bodyOf(world, 'PATCH /api/money/accounts/cash')).toBeUndefined();
    await userEvent.click(within(accounts).getByRole('button', { name: 'Yes, archive it' }));

    await waitFor(() => expect(bodyOf(world, 'PATCH /api/money/accounts/cash')).toEqual({ archived: true }));
    const archived = await within(accounts).findByRole('list', { name: 'Archived accounts' });
    expect(within(archived).getByText('Cash')).toBeInTheDocument();
    expect(within(accounts).queryByRole('form', { name: 'Cash' })).not.toBeInTheDocument();
    expect(within(archived).getByRole('button', { name: 'Restore Cash' })).toBeInTheDocument();
  });

  it('moves an account up, sending the whole order', async () => {
    const world = mockWorld();
    renderSettings();
    const accounts = await section('Accounts');
    expect(within(accounts).getByRole('button', { name: 'Move Bank up' })).toBeDisabled();
    await userEvent.click(within(accounts).getByRole('button', { name: 'Move Cash up' }));
    await waitFor(() => expect(bodyOf(world, 'POST /api/money/accounts/reorder')).toEqual({ ids: ['cash', 'bank'] }));
  });

  it('names both categories before merging them', async () => {
    const world = mockWorld();
    renderSettings();
    const categories = await section('Categories');
    const row = within(categories).getByRole('form', { name: 'Food' });
    await userEvent.selectOptions(within(row).getByLabelText('Merge into'), 'travel');
    await userEvent.click(within(row).getByRole('button', { name: 'Merge' }));

    expect(within(row).getByText(/Move everything in Food into Travel/)).toBeInTheDocument();
    expect(bodyOf(world, 'POST /api/money/categories/food/merge')).toBeUndefined();
    await userEvent.click(within(row).getByRole('button', { name: 'Yes, merge them' }));
    await waitFor(() => expect(bodyOf(world, 'POST /api/money/categories/food/merge')).toEqual({ intoId: 'travel' }));
    await waitFor(() => expect(within(categories).queryByRole('form', { name: 'Food' })).not.toBeInTheDocument());
  });

  it('does not offer to archive or merge the Fees category', async () => {
    mockWorld();
    renderSettings();
    const row = within(await section('Categories')).getByRole('form', { name: 'Fees' });
    expect(within(row).queryByRole('button', { name: 'Archive Fees' })).not.toBeInTheDocument();
    expect(within(row).queryByLabelText('Merge into')).not.toBeInTheDocument();
  });

  it('a budget cleared to empty removes it', async () => {
    const world = mockWorld();
    renderSettings();
    const budgets = await section('Budgets');
    const food = within(budgets).getByLabelText('Food');
    expect(food).toHaveValue('6000');
    expect(within(budgets).getByLabelText('Whole month')).toHaveValue('20000');

    await userEvent.clear(food);
    await userEvent.click(within(budgets).getByRole('button', { name: 'Save the budget for Food' }));
    await waitFor(() => expect(bodyOf(world, 'PUT /api/money/budgets')).toEqual({ categoryId: 'food', amount: 0 }));
  });

  it('sets a budget for the whole month in paisa', async () => {
    const world = mockWorld();
    renderSettings();
    const budgets = await section('Budgets');
    await userEvent.clear(within(budgets).getByLabelText('Whole month'));
    await userEvent.type(within(budgets).getByLabelText('Whole month'), '25000');
    await userEvent.click(within(budgets).getByRole('button', { name: 'Save the budget for Whole month' }));
    await waitFor(() =>
      expect(bodyOf(world, 'PUT /api/money/budgets')).toEqual({ categoryId: null, amount: 2_500_000 }),
    );
  });

  it('asks before deleting a shortcut', async () => {
    const world = mockWorld();
    renderSettings();
    const shortcuts = await section('Shortcuts');
    await userEvent.click(within(shortcuts).getByRole('button', { name: 'Delete Office rickshaw' }));
    expect(world.calls.some((call) => call.key === 'DELETE /api/money/shortcuts/s1')).toBe(false);
    await userEvent.click(within(shortcuts).getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(() => expect(world.calls.some((call) => call.key === 'DELETE /api/money/shortcuts/s1')).toBe(true));
  });

  it('the reminder form sends only the daily reminder', async () => {
    const world = mockWorld();
    renderSettings();
    const reminders = await section('Reminders and warnings');
    await userEvent.click(within(reminders).getByRole('switch', { name: 'Daily reminder to log spending' }));
    await userEvent.click(within(reminders).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(bodyOf(world, 'PATCH /api/settings')).toEqual({
        'money.dailyReminder': {
          ...defaultSettings['money.dailyReminder'],
          enabled: !defaultSettings['money.dailyReminder'].enabled,
        },
      }),
    );
  });

  it('changes the budget warning percentage', async () => {
    const world = mockWorld();
    renderSettings();
    const reminders = await section('Reminders and warnings');
    const percent = within(reminders).getByLabelText('Warn me when a budget is this much used (%)');
    await userEvent.clear(percent);
    await userEvent.type(percent, '90');
    await userEvent.click(within(reminders).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(bodyOf(world, 'PATCH /api/settings')).toEqual({ 'money.budgetWarnPercent': 90 }));
  });
});
