import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskBox } from './AskBox';
import { SettingsProvider } from './SettingsProvider';

const accounts = [
  { id: 'cash', name: 'Cash', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 0, archived: false, balance: 0 },
  { id: 'bkash', name: 'bKash', openingBalance: 0, openingDate: '2026-01-01', sortOrder: 1, archived: false, balance: 0 },
];
const categories = [
  { id: 'food', name: 'Food', color: 'coral', icon: 'food', sortOrder: 0, isFees: false, archived: false },
  { id: 'fees', name: 'Fees', color: 'sage', icon: 'fee', sortOrder: 1, isFees: true, archived: false },
];

function mockApi(enabled: boolean, ask: () => { status: number; body: unknown }) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'GET /api/ai/status') return json({ enabled, source: enabled ? 'settings' : null, hint: null });
      if (key === 'POST /api/ai/ask') {
        const answer = ask();
        return json(answer.body, answer.status);
      }
      if (key === 'GET /api/money/accounts') return json(accounts);
      if (key === 'GET /api/money/categories') return json(categories);
      if (key === 'POST /api/money/entries') return json({ id: 'e1' }, 201);
      if (key === 'POST /api/ai/create-reminder') return json({ id: 'r1' }, 201);
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderBox = (props: Parameters<typeof AskBox>[0] = {}) =>
  render(
    <SettingsProvider>
      <AskBox {...props} />
    </SettingsProvider>,
  );

describe('AskBox', () => {
  it('is not there at all when the assistant is not set up', async () => {
    const calls = mockApi(false, () => ({ status: 200, body: {} }));
    const { container } = renderBox();
    await waitFor(() => expect(calls.some((call) => call.key === 'GET /api/ai/status')).toBe(true));
    await Promise.resolve();
    expect(container.querySelector('form')).toBeNull();
  });

  it('shows the answer to a question', async () => {
    const calls = mockApi(true, () => ({ status: 200, body: { type: 'answer', text: 'You spent 250 on Food.' } }));
    renderBox();
    await userEvent.type(await screen.findByLabelText('Ask'), 'How much on food?');
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('You spent 250 on Food.')).toBeInTheDocument();
    expect(calls.find((call) => call.key === 'POST /api/ai/ask')?.body).toEqual({ text: 'How much on food?', scope: 'all' });
  });

  it('sends the page it is on, so a money page only asks about money', async () => {
    const calls = mockApi(true, () => ({ status: 200, body: { type: 'answer', text: 'ok' } }));
    renderBox({ scope: 'money' });
    await userEvent.type(await screen.findByLabelText('Ask'), 'Spent?{Enter}');
    await screen.findByText('ok');
    expect(calls.find((call) => call.key === 'POST /api/ai/ask')?.body).toEqual({ text: 'Spent?', scope: 'money' });
  });

  it('shows spending it understood and adds nothing until confirmed, then adds each with a real account and category', async () => {
    const calls = mockApi(true, () => ({
      status: 200,
      body: {
        type: 'expense',
        items: [
          { name: 'Tea', amount: 2000, accountId: null, categoryId: null, date: '2026-11-23' },
          { name: 'Taxi', amount: 9000, accountId: 'bkash', categoryId: 'food', date: '2026-11-22' },
        ],
      },
    }));
    const added = vi.fn();
    renderBox({ onAdded: added });
    await userEvent.type(await screen.findByLabelText('Ask'), 'tea 20, taxi 90 bkash{Enter}');

    const list = await screen.findByRole('list', { name: 'Expenses to add' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(calls.some((call) => call.key === 'POST /api/money/entries')).toBe(false);

    await userEvent.click(await screen.findByRole('button', { name: 'Add 2 expenses' }));
    expect(await screen.findByText('2 expenses added.')).toBeInTheDocument();
    const saved = calls.filter((call) => call.key === 'POST /api/money/entries').map((call) => call.body);
    expect(saved).toEqual([
      { kind: 'expense', name: 'Tea', amount: 2000, accountId: 'cash', categoryId: 'food', date: '2026-11-23' },
      { kind: 'expense', name: 'Taxi', amount: 9000, accountId: 'bkash', categoryId: 'food', date: '2026-11-22' },
    ]);
    expect(added).toHaveBeenCalled();
  });

  it('lets one line be left out before adding', async () => {
    const calls = mockApi(true, () => ({
      status: 200,
      body: { type: 'expense', items: [{ name: 'Tea', amount: 2000, accountId: null, categoryId: null, date: '2026-11-23' }, { name: 'Gift', amount: 50000, accountId: null, categoryId: null, date: '2026-11-23' }] },
    }));
    renderBox();
    await userEvent.type(await screen.findByLabelText('Ask'), 'tea 20 gift 500{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Leave out Gift' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add 1 expense' }));
    await screen.findByText('1 expense added.');
    expect(calls.filter((call) => call.key === 'POST /api/money/entries')).toHaveLength(1);
  });

  it('shows a reminder for confirming, and sets it only when asked', async () => {
    const calls = mockApi(true, () => ({ status: 200, body: { type: 'reminder', title: 'Pay rent', at: '2099-12-05T03:00:00.000Z', whenText: 'Saturday 5 December, 9:00 am' } }));
    renderBox();
    await userEvent.type(await screen.findByLabelText('Ask'), 'remind me to pay rent on the 5th{Enter}');
    expect(await screen.findByText('Pay rent')).toBeInTheDocument();
    expect(screen.getByText('Saturday 5 December, 9:00 am')).toBeInTheDocument();
    expect(calls.some((call) => call.key === 'POST /api/ai/create-reminder')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Set reminder' }));
    expect(await screen.findByText('Reminder set for Saturday 5 December, 9:00 am.')).toBeInTheDocument();
    expect(calls.find((call) => call.key === 'POST /api/ai/create-reminder')?.body).toEqual({ title: 'Pay rent', at: '2099-12-05T03:00:00.000Z' });
  });

  it('says what went wrong when the assistant fails', async () => {
    mockApi(true, () => ({ status: 502, body: { message: 'The assistant could not be reached. Try again in a moment.' } }));
    renderBox();
    await userEvent.type(await screen.findByLabelText('Ask'), 'hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('The assistant could not be reached.');
  });
});
