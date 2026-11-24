import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoutineBuilder } from './RoutineBuilder';

const proposal = [
  {
    name: 'Gym',
    points: 1000,
    timing: { kind: 'fixed', start: '06:30', due: '07:30' },
    appliesTo: { kind: 'weekdays', days: [1, 3, 5] },
    reminders: { channels: ['push'], onOpen: true, onDue: false, warn: true },
  },
  {
    name: 'Read',
    points: 400,
    timing: { kind: 'fixed', due: '22:00' },
    appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
    reminders: { channels: ['push'], onOpen: true, onDue: false, warn: true },
  },
];

function mockApi(answer: { status: number; body: unknown } = { status: 200, body: { items: proposal } }) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (key === 'POST /api/ai/routine') return json(answer.body, answer.status);
      if (key === 'POST /api/habits/items') return json({ id: 'new' }, 201);
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

describe('RoutineBuilder', () => {
  it('shows suggested habits with everything ticked, and adds nothing until the button is pressed', async () => {
    const calls = mockApi();
    render(<RoutineBuilder onClose={vi.fn()} onAdded={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Describe your ideal day/), 'gym and reading');
    await userEvent.click(screen.getByRole('button', { name: 'Suggest habits' }));

    expect(await screen.findByText('Gym')).toBeInTheDocument();
    expect(screen.getByText('06:30 to 07:30')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    expect(calls.some((call) => call.key === 'POST /api/habits/items')).toBe(false);
  });

  it('adds only the ones left ticked, as real routine items', async () => {
    const calls = mockApi();
    const onAdded = vi.fn();
    render(<RoutineBuilder onClose={vi.fn()} onAdded={onAdded} />);
    await userEvent.type(screen.getByLabelText(/Describe your ideal day/), 'gym and reading');
    await userEvent.click(screen.getByRole('button', { name: 'Suggest habits' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Read/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 to the routine' }));

    await vi.waitFor(() => expect(onAdded).toHaveBeenCalled());
    const created = calls.filter((call) => call.key === 'POST /api/habits/items');
    expect(created).toHaveLength(1);
    expect(created[0]!.body).toMatchObject({ name: 'Gym', points: 1000, lateShare: null, missMultiplier: null, ignoreQuietHours: false });
  });

  it('says what went wrong when nothing usable came back', async () => {
    mockApi({ status: 422, body: { message: 'Could not turn that into habits.' } });
    render(<RoutineBuilder onClose={vi.fn()} onAdded={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Describe your ideal day/), 'stuff');
    await userEvent.click(screen.getByRole('button', { name: 'Suggest habits' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not turn that into habits.');
  });
});
