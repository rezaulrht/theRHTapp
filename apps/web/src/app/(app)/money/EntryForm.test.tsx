import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fromPaisa, paisaToInput, toPaisa, type Account, type Category, type Entry } from '@/lib/money';
import { EntryForm } from './EntryForm';

const accounts: Account[] = [
  { id: 'bank', name: 'Bank', openingBalance: 0, openingDate: '2026-11-01', sortOrder: 0, archived: false, balance: 5_000_000 },
  { id: 'bkash', name: 'bKash', openingBalance: 0, openingDate: '2026-11-01', sortOrder: 1, archived: false, balance: 300_000 },
  { id: 'cash', name: 'Cash', openingBalance: 0, openingDate: '2026-11-01', sortOrder: 2, archived: false, balance: 100_000 },
];
const categories: Category[] = [
  { id: 'travel', name: 'Travel', color: 'sky', icon: 'bus', sortOrder: 0, isFees: false, archived: false },
  { id: 'food', name: 'Food', color: 'coral', icon: 'food', sortOrder: 1, isFees: false, archived: false },
  { id: 'fees', name: 'Fees', color: 'sage', icon: 'fee', sortOrder: 2, isFees: true, archived: false },
];
const saved: Entry = {
  id: 'e1',
  kind: 'expense',
  date: '2026-11-13',
  amount: 8000,
  name: 'Office rickshaw',
  note: null,
  accountId: 'cash',
  toAccountId: null,
  categoryId: 'travel',
  personId: null,
  loanDirection: null,
  feeOfId: null,
  fee: null,
  createdAt: '2026-11-13T04:00:00.000Z',
};

type Route = (body: unknown) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

function mockApi(routes: Record<string, Route>) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const route = routes[key];
      if (!route) throw new Error(`Unexpected request: ${key} (${url})`);
      const answer = await route(body);
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

const noSuggestions: Route = () => ({ status: 200, body: [] });
const posts = <T extends { key: string }>(calls: T[]): T[] => calls.filter((call) => !call.key.startsWith('GET'));

function renderForm(props: Partial<Parameters<typeof EntryForm>[0]> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <EntryForm
      accounts={accounts}
      categories={categories}
      defaultDate="2026-11-13"
      onSaved={onSaved}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSaved, onCancel };
}

describe('amount helpers', () => {
  it('round-trip between what is typed and paisa', () => {
    expect(toPaisa('12.50')).toEqual({ ok: true, paisa: 1250 });
    expect(fromPaisa(1250)).toBe(12.5);
    expect(paisaToInput(1250)).toBe('12.50');
    expect(paisaToInput(8000)).toBe('80');
    expect(toPaisa(paisaToInput(1850))).toEqual({ ok: true, paisa: 1850 });
  });
});

describe('EntryForm', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts on an expense, with the amount focused and today filled in', () => {
    mockApi({ 'GET /api/money/entries/names': noSuggestions });
    renderForm();
    expect(screen.getByLabelText('Amount')).toHaveFocus();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-13');
    expect(screen.getByRole('button', { name: 'Add expense' })).toBeInTheDocument();
  });

  it('posts paisa, not taka', async () => {
    const calls = mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'POST /api/money/entries': () => ({ status: 201, body: saved }),
    });
    const { onSaved } = renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), '12.50');
    await userEvent.type(screen.getByLabelText('What was it for?'), 'Tea');
    await userEvent.selectOptions(screen.getByLabelText('Paid from'), 'cash');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'food');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(posts(calls)).toEqual([
      {
        key: 'POST /api/money/entries',
        body: { kind: 'expense', date: '2026-11-13', amount: 1250, name: 'Tea', accountId: 'cash', categoryId: 'food' },
      },
    ]);
  });

  it.each([
    ['', 'Enter an amount'],
    ['abc', 'Enter a number, like 80 or 12.50'],
    ['-5', 'Enter a number, like 80 or 12.50'],
    ['0', 'Enter an amount above zero'],
    ['12.345', 'Use at most two decimal places'],
    ['20000001', 'That amount is too large'],
  ])('refuses the amount %j and posts nothing', async (typed, message) => {
    const calls = mockApi({ 'GET /api/money/entries/names': noSuggestions });
    const { onSaved } = renderForm();
    if (typed) await userEvent.type(screen.getByLabelText('Amount'), typed);
    await userEvent.type(screen.getByLabelText('What was it for?'), 'Tea');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    const error = await screen.findByText(message);
    expect(screen.getByLabelText('Amount').getAttribute('aria-describedby')).toBe(error.id);
    expect(posts(calls)).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(['1,250', '.5', ' 80 '])('accepts the amount %j', async (typed) => {
    const calls = mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'POST /api/money/entries': () => ({ status: 201, body: saved }),
    });
    renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), typed);
    await userEvent.type(screen.getByLabelText('What was it for?'), 'Tea');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
  });

  it('asks what it was for', async () => {
    const calls = mockApi({ 'GET /api/money/entries/names': noSuggestions });
    renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), '80');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    expect(await screen.findByText('Say what it was for')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('picking a suggestion fills the name, account and category', async () => {
    mockApi({
      'GET /api/money/entries/names': () => ({
        status: 200,
        body: [{ name: 'Office rickshaw', accountId: 'cash', categoryId: 'travel', amount: 8000 }],
      }),
    });
    renderForm();
    await userEvent.type(screen.getByLabelText('What was it for?'), 'off');
    await userEvent.click(await screen.findByRole('button', { name: /Office rickshaw/ }));

    expect(screen.getByLabelText('What was it for?')).toHaveValue('Office rickshaw');
    expect(screen.getByLabelText('Paid from')).toHaveValue('cash');
    expect(screen.getByLabelText('Category')).toHaveValue('travel');
    // The amount is filled only because it was empty.
    expect(screen.getByLabelText('Amount')).toHaveValue('80');
  });

  it('a suggestion does not overwrite an amount already typed', async () => {
    mockApi({
      'GET /api/money/entries/names': () => ({
        status: 200,
        body: [{ name: 'Office rickshaw', accountId: 'cash', categoryId: 'travel', amount: 8000 }],
      }),
    });
    renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), '100');
    await userEvent.type(screen.getByLabelText('What was it for?'), 'off');
    await userEvent.click(await screen.findByRole('button', { name: /Office rickshaw/ }));
    expect(screen.getByLabelText('Amount')).toHaveValue('100');
  });

  it('remembers the account used last time', async () => {
    mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'POST /api/money/entries': () => ({ status: 201, body: saved }),
    });
    const first = renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), '80');
    await userEvent.type(screen.getByLabelText('What was it for?'), 'Tea');
    await userEvent.selectOptions(screen.getByLabelText('Paid from'), 'bkash');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    await waitFor(() => expect(first.onSaved).toHaveBeenCalled());
    document.body.innerHTML = '';

    renderForm();
    expect(screen.getByLabelText('Paid from')).toHaveValue('bkash');
  });

  it('leaves the Fees category out of the picker', () => {
    mockApi({ 'GET /api/money/entries/names': noSuggestions });
    renderForm();
    expect(screen.queryByRole('option', { name: 'Fees' })).not.toBeInTheDocument();
  });

  it('income has no category', async () => {
    const calls = mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'POST /api/money/entries': () => ({ status: 201, body: { ...saved, kind: 'income' } }),
    });
    renderForm();
    await userEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Amount'), '40000');
    await userEvent.type(screen.getByLabelText('Where did it come from?'), 'Salary');
    await userEvent.selectOptions(screen.getByLabelText('Paid into'), 'bank');
    await userEvent.click(screen.getByRole('button', { name: 'Add income' }));
    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]!.body).toEqual({
      kind: 'income',
      date: '2026-11-13',
      amount: 4_000_000,
      name: 'Salary',
      accountId: 'bank',
    });
  });

  it('a transfer hides the category and name, and takes a to-account and a fee', async () => {
    const calls = mockApi({
      'POST /api/money/entries': () => ({ status: 201, body: { ...saved, kind: 'transfer' } }),
    });
    renderForm();
    await userEvent.click(screen.getByRole('radio', { name: 'Move money' }));
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('What was it for?')).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Amount'), '1000');
    await userEvent.selectOptions(screen.getByLabelText('From'), 'bkash');
    await userEvent.selectOptions(screen.getByLabelText('To'), 'cash');
    await userEvent.type(screen.getByLabelText('Fee, if any'), '18.50');
    await userEvent.click(screen.getByRole('button', { name: 'Move money' }));

    await waitFor(() => expect(posts(calls)).toHaveLength(1));
    expect(posts(calls)[0]!.body).toEqual({
      kind: 'transfer',
      date: '2026-11-13',
      amount: 100_000,
      accountId: 'bkash',
      toAccountId: 'cash',
      fee: 1850,
    });
  });

  it('refuses a transfer to the same account and a bad fee', async () => {
    const calls = mockApi({});
    renderForm();
    await userEvent.click(screen.getByRole('radio', { name: 'Move money' }));
    await userEvent.type(screen.getByLabelText('Amount'), '1000');
    await userEvent.selectOptions(screen.getByLabelText('From'), 'cash');
    await userEvent.selectOptions(screen.getByLabelText('To'), 'cash');
    await userEvent.click(screen.getByRole('button', { name: 'Move money' }));
    expect(await screen.findByText('Pick a different account to move money to')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('To'), 'bank');
    await userEvent.type(screen.getByLabelText('Fee, if any'), 'free');
    await userEvent.click(screen.getByRole('button', { name: 'Move money' }));
    expect(await screen.findByText('Enter a number, like 80 or 12.50')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(0);
  });

  it('editing pre-fills the form, keeps the kind, and sends a PATCH', async () => {
    const calls = mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'PATCH /api/money/entries/e1': () => ({ status: 200, body: { ...saved, amount: 9050 } }),
    });
    const { onSaved } = renderForm({ initial: { ...saved, note: 'rain' } });
    expect(screen.getByLabelText('Amount')).toHaveValue('80');
    expect(screen.getByLabelText('What was it for?')).toHaveValue('Office rickshaw');
    expect(screen.getByLabelText('Note')).toHaveValue('rain');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Amount'));
    await userEvent.type(screen.getByLabelText('Amount'), '90.50');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(posts(calls)[0]).toEqual({
      key: 'PATCH /api/money/entries/e1',
      body: { date: '2026-11-13', amount: 9050, name: 'Office rickshaw', accountId: 'cash', categoryId: 'travel', note: 'rain' },
    });
  });

  it('shows a server error beside the field it names', async () => {
    mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'POST /api/money/entries': () => ({
        status: 400,
        body: { message: 'Some fields are not valid', errors: [{ path: 'date', message: 'Pick today or an earlier date' }] },
      }),
    });
    const { onSaved } = renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), '80');
    await userEvent.type(screen.getByLabelText('What was it for?'), 'Tea');
    await userEvent.click(screen.getByRole('button', { name: 'Add expense' }));

    const error = await screen.findByText('Pick today or an earlier date');
    expect(screen.getByLabelText('Date').getAttribute('aria-describedby')).toBe(error.id);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables the button while saving, so one tap makes one entry', async () => {
    let finish: (value: { status: number; body: unknown }) => void = () => {};
    const calls = mockApi({
      'GET /api/money/entries/names': noSuggestions,
      'POST /api/money/entries': () => new Promise((resolve) => (finish = resolve)),
    });
    renderForm();
    await userEvent.type(screen.getByLabelText('Amount'), '80');
    await userEvent.type(screen.getByLabelText('What was it for?'), 'Tea');
    const button = screen.getByRole('button', { name: 'Add expense' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(posts(calls)).toHaveLength(1);
    finish({ status: 201, body: saved });
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('cancels', async () => {
    mockApi({ 'GET /api/money/entries/names': noSuggestions });
    const { onCancel } = renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
