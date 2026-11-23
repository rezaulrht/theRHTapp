import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { DayItem, DayReport, TodayHabitsReport } from '@/lib/habits';
import { habitToday, instantOn } from '@/lib/habits-text';
import { addDays } from '@/lib/money-text';
import { TodayHabits } from '../today/TodayHabits';
import { DayView } from './DayView';

vi.mock('next/navigation', () => ({
  usePathname: () => '/habits',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const zone = 'Asia/Dhaka';
const today = habitToday(zone, 4);
const yesterday = addDays(today, -1);
const on = (time: string, day = today) => instantOn(day, time, zone, 4).toISOString();

const item = (over: Partial<DayItem>): DayItem => ({
  itemId: 'breakfast',
  name: 'Breakfast',
  points: 500,
  timing: { kind: 'fixed', due: '08:30' },
  opensAt: null,
  dueAt: on('08:30'),
  outcome: 'pending',
  score: 0,
  skipped: false,
  marks: [],
  target: null,
  ...over,
});

const water = item({
  itemId: 'water',
  name: 'Water',
  timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 },
  opensAt: on('09:00'),
  dueAt: on('21:00'),
  target: 8,
  marks: [1, 2, 3].map((n) => ({ id: `w${n}`, at: on(`1${n}:00`) })),
});

function reportOf(items: DayItem[], over: Partial<DayReport> = {}): DayReport {
  const counted = items.filter((entry) => entry.outcome !== 'skipped');
  return {
    day: today,
    isToday: true,
    closed: false,
    skipped: false,
    skippedReason: null,
    prayers: { fajr: on('05:00'), sunrise: on('06:15'), zuhr: on('11:45'), asr: on('15:35'), maghrib: on('17:15'), isha: on('18:35') },
    score: items.reduce((sum, entry) => sum + entry.score, 0),
    possible: counted.reduce((sum, entry) => sum + entry.points, 0),
    lost: 0,
    target: Math.round(counted.reduce((sum, entry) => sum + entry.points, 0) * 0.7),
    won: counted.length === 0 ? null : false,
    next: null,
    items,
    ...over,
  };
}

interface World {
  report: DayReport;
  past: DayReport;
  calls: { key: string; body: unknown }[];
  /** Holds the answer to a tick until released, to test taps made meanwhile. */
  hold: Promise<void> | null;
}

function mockWorld(report: DayReport, past: DayReport = reportOf([], { day: yesterday, isToday: false, closed: true })): World {
  const world: World = { report, past, calls: [], hold: null };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0]!;
      const key = `${init?.method ?? 'GET'} ${path}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      world.calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      const change = (edit: (entry: DayItem) => DayItem, id: string) => {
        world.report = { ...world.report, items: world.report.items.map((entry) => (entry.itemId === id ? edit(entry) : entry)) };
        return json(world.report, 201);
      };

      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === `GET /api/habits/days/${today}`) return json(world.report);
      if (key === `GET /api/habits/days/${yesterday}`) return json(world.past);
      if (key === `POST /api/habits/days/${today}/marks`) {
        if (world.hold) await world.hold;
        const id = (body as { itemId: string }).itemId;
        return change(
          (entry) => ({
            ...entry,
            marks: [...entry.marks, { id: `m${world.calls.length}`, at: on('08:20') }],
            outcome: entry.target === null ? 'onTime' : entry.outcome,
            score: entry.target === null ? entry.points : entry.score,
          }),
          id,
        );
      }
      if (key.startsWith('PATCH /api/habits/marks/') || key.startsWith('DELETE /api/habits/marks/')) {
        const markId = path.split('/').pop();
        const owner = world.report.items.find((entry) => entry.marks.some((mark) => mark.id === markId))!;
        return change(
          (entry) =>
            key.startsWith('DELETE')
              ? { ...entry, marks: entry.marks.filter((mark) => mark.id !== markId), outcome: 'pending', score: 0 }
              : { ...entry, marks: entry.marks.map((mark) => (mark.id === markId ? { ...mark, at: (body as { at: string }).at } : mark)) },
          owner.itemId,
        );
      }
      if (key === `PUT /api/habits/days/${today}/skip`) {
        world.report = { ...world.report, skipped: true, skippedReason: (body as { reason?: string }).reason ?? null, won: null, score: 0 };
        return json(world.report);
      }
      if (key === `DELETE /api/habits/days/${today}/skip`) {
        world.report = { ...world.report, skipped: false, skippedReason: null };
        return json(world.report);
      }
      if (key.startsWith(`PUT /api/habits/days/${today}/items/`)) {
        return change((entry) => ({ ...entry, skipped: true, outcome: 'skipped' }), path.split('/').at(-2)!);
      }
      if (key === 'GET /api/habits/today') {
        const answer: TodayHabitsReport = {
          day: today,
          score: 1250,
          possible: 8000,
          target: 5600,
          won: false,
          next: { itemId: 'snack', name: 'Snack', at: on('11:00') },
          done: 3,
          total: 16,
          skipped: false,
        };
        return json(answer);
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
const bodyOf = (world: World, key: string) => world.calls.find((call) => call.key === key)?.body;

describe('habits DayView', () => {
  it('lists the routine in the order given, with each item’s window and result', async () => {
    mockWorld(
      reportOf(
        [
          item({ outcome: 'onTime', score: 500, marks: [{ id: 'm1', at: on('08:20') }] }),
          water,
          item({ itemId: 'snack', name: 'Snack', timing: { kind: 'fixed', start: '11:00', due: '11:30' }, opensAt: on('11:00'), dueAt: on('11:30'), outcome: 'late', score: 250, marks: [{ id: 'm2', at: on('11:50') }] }),
          item({ itemId: 'teeth', name: 'Teeth', timing: { kind: 'fixed' }, dueAt: on('03:59') }),
        ],
        { next: { itemId: 'teeth', name: 'Teeth', at: on('03:59') }, target: 1400 },
      ),
    );
    renderDay();

    const rows = within(await screen.findByRole('list', { name: 'Routine' })).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('Breakfast')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('By 8:30 am')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('On time')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('+5')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('3 of 8')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('11:00 to 11:30 am')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Late')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('+2.5')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Any time today')).toBeInTheDocument();

    // 750 so far of 2000, with 1400 to win.
    expect(screen.getByLabelText('7.5')).toBeInTheDocument();
    expect(screen.getByText('of 20')).toBeInTheDocument();
    expect(screen.getByText('6.5 to go to win the day')).toBeInTheDocument();
    expect(screen.getByText(/^Next: Teeth at/)).toBeInTheDocument();
  });

  it('one tap ticks an item, sending no time of its own', async () => {
    const world = mockWorld(reportOf([item({})]));
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'Mark Breakfast done' }));

    expect(await screen.findByText('On time')).toBeInTheDocument();
    expect(bodyOf(world, `POST /api/habits/days/${today}/marks`)).toEqual({ itemId: 'breakfast' });
    expect(screen.getByRole('button', { name: 'Breakfast, done. Change it' })).toBeInTheDocument();
  });

  it('a second tap while the first is being saved does not tick twice', async () => {
    const world = mockWorld(reportOf([item({})]));
    let release!: () => void;
    world.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderDay();
    const button = await screen.findByRole('button', { name: 'Mark Breakfast done' });
    await userEvent.click(button);
    await userEvent.click(button);
    release();

    await screen.findByText('On time');
    expect(count(world, `POST /api/habits/days/${today}/marks`)).toBe(1);
  });

  it('a repeating item takes a tick on every tap', async () => {
    const world = mockWorld(reportOf([water]));
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'Add one for Water' }));
    expect(await screen.findByText('4 of 8')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add one for Water' }));
    expect(await screen.findByText('5 of 8')).toBeInTheDocument();
    expect(count(world, `POST /api/habits/days/${today}/marks`)).toBe(2);
  });

  it('corrects the time an item was done, on the right calendar date', async () => {
    const world = mockWorld(
      reportOf([item({ itemId: 'sleep', name: 'Sleep', timing: { kind: 'fixed', due: '23:30' }, dueAt: on('23:30'), outcome: 'late', score: 250, marks: [{ id: 'm9', at: on('01:30') }] })]),
    );
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'Sleep, done. Change it' }));

    const dialog = screen.getByRole('dialog');
    const field = within(dialog).getByLabelText('Done at');
    expect(field).toHaveValue('01:30');
    await userEvent.clear(field);
    await userEvent.type(field, '01:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save time' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // One in the morning is on the calendar date after the habit day.
    expect(bodyOf(world, 'PATCH /api/habits/marks/m9')).toEqual({
      at: new Date(`${addDays(today, 1)}T01:00:00+06:00`).toISOString(),
    });
  });

  it('undoes a tick', async () => {
    const world = mockWorld(reportOf([item({ outcome: 'onTime', score: 500, marks: [{ id: 'm1', at: on('08:20') }] })]));
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'More for Breakfast' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('button', { name: 'Mark Breakfast done' })).toBeInTheDocument();
    expect(count(world, 'DELETE /api/habits/marks/m1')).toBe(1);
  });

  it('skips one item for the day', async () => {
    const world = mockWorld(reportOf([item({})]));
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'More for Breakfast' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Skip for this day' }));

    expect(await screen.findByText('Skipped')).toBeInTheDocument();
    expect(count(world, `PUT /api/habits/days/${today}/items/breakfast/skip`)).toBe(1);
    expect(screen.getByRole('button', { name: 'Breakfast, skipped' })).toBeDisabled();
  });

  it('asks before skipping the day, sends the reason, and can unskip', async () => {
    const world = mockWorld(reportOf([item({})]));
    renderDay();
    await userEvent.click(await screen.findByRole('button', { name: 'Skip this day' }));
    expect(count(world, `PUT /api/habits/days/${today}/skip`)).toBe(0);
    await userEvent.type(screen.getByLabelText('Reason (optional)'), 'Fever');
    await userEvent.click(screen.getByRole('button', { name: 'Yes, skip it' }));

    expect(await screen.findByText('Day skipped: Fever')).toBeInTheDocument();
    expect(bodyOf(world, `PUT /api/habits/days/${today}/skip`)).toEqual({ reason: 'Fever' });
    expect(screen.getByRole('button', { name: 'Mark Breakfast done' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Unskip' }));
    await waitFor(() => expect(screen.queryByText(/Day skipped/)).not.toBeInTheDocument());
  });

  it('a day with nothing on it says so and shows no score', async () => {
    mockWorld(reportOf([]));
    renderDay();
    expect(await screen.findByText('Nothing on the routine for this day.')).toBeInTheDocument();
    expect(screen.queryByText('Score')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip this day' })).not.toBeInTheDocument();
  });

  it('opens the day named in the link from the progress page', async () => {
    mockWorld(reportOf([item({})]), reportOf([item({ outcome: 'missed', score: -750 })], { day: yesterday, isToday: false, closed: true }));
    window.history.replaceState(null, '', `/habits?day=${yesterday}`);
    renderDay();
    expect(await screen.findByText('Missed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
    // The link's day is used once; the address goes back to plain.
    expect(window.location.search).toBe('');
  });

  it('ignores a day in the link that has not come yet', async () => {
    mockWorld(reportOf([item({})]));
    window.history.replaceState(null, '', `/habits?day=${addDays(today, 3)}`);
    renderDay();
    expect(await screen.findByRole('button', { name: 'Mark Breakfast done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
  });

  it('goes back a day, never forward past today, and a lost day lists what cost most first', async () => {
    const past = reportOf(
      [
        item({ outcome: 'late', score: 250, marks: [{ id: 'p1', at: on('09:00', yesterday) }] }),
        item({ itemId: 'gym', name: 'Gym', outcome: 'missed', score: -750 }),
        item({ itemId: 'walk', name: 'Walk', outcome: 'onTime', score: 500, marks: [{ id: 'p2', at: on('14:00', yesterday) }] }),
      ],
      { day: yesterday, isToday: false, closed: true, won: false, target: 1050 },
    );
    mockWorld(reportOf([item({})]), past);
    renderDay();
    await screen.findByRole('list', { name: 'Routine' });
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    const lost = await screen.findByRole('list', { name: 'Points lost' });
    const rows = within(lost).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Gym');
    expect(rows[0]).toHaveTextContent('−12.5');
    expect(rows[1]).toHaveTextContent('Breakfast');
    expect(rows[1]).toHaveTextContent('−2.5');
    expect(screen.getByText('Day lost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });
});

describe('TodayHabits', () => {
  it('shows the score so far and what is next', async () => {
    mockWorld(reportOf([]));
    render(
      <SettingsProvider>
        <TodayHabits />
      </SettingsProvider>,
    );
    expect(await screen.findByLabelText('12.5')).toBeInTheDocument();
    expect(screen.getByText('of 80')).toBeInTheDocument();
    expect(screen.getByText('3 of 16')).toBeInTheDocument();
    expect(screen.getByText('Next: Snack at 11:00 am')).toBeInTheDocument();
    expect(screen.getByText('43.5 to go to win the day')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open routine' })).toHaveAttribute('href', '/habits');
  });
});
