import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { HabitItem } from '@/lib/habits';
import { HabitsSettings } from './HabitsSettings';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/habits',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const reminders = { channels: ['push' as const], onOpen: false, onDue: true, warn: true };
const breakfast: HabitItem = {
  id: 'breakfast',
  name: 'Breakfast',
  points: 500,
  timing: { kind: 'fixed', due: '08:30' },
  appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
  lateShare: 0.8,
  missMultiplier: null,
  reminders,
  ignoreQuietHours: false,
  sortOrder: 0,
  paused: false,
  archived: false,
};
const fajr: HabitItem = {
  ...breakfast,
  id: 'fajr',
  name: 'Fajr',
  timing: { kind: 'prayer', prayer: 'fajr' },
  lateShare: null,
  sortOrder: 1,
};

type Override = (body: unknown) => { status: number; body?: unknown };

function mockApi(overrides: Record<string, Override> = {}) {
  const calls: { key: string; body: unknown }[] = [];
  let items = [breakfast, fajr];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.split('?')[0]!;
      const key = `${init?.method ?? 'GET'} ${path}`;
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ key, body });
      const json = (data: unknown, status = 200) =>
        new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      const override = overrides[key];
      if (override) {
        const answer = override(body);
        return json(answer.body, answer.status);
      }
      if (key === 'GET /api/settings') return json(defaultSettings);
      if (key === 'PATCH /api/settings') return json({ ...defaultSettings, ...(body as object) });
      if (key === 'GET /api/habits/items') return json(items);
      if (path.startsWith('/api/habits/prayer-times')) {
        return json({ day: '2026-11-15', fajr: '2026-11-14T22:55:00Z', sunrise: '2026-11-15T00:13:00Z', zuhr: '2026-11-15T05:50:00Z', asr: '2026-11-15T09:37:00Z', maghrib: '2026-11-15T11:13:00Z', isha: '2026-11-15T12:31:00Z' });
      }
      if (key === 'POST /api/habits/items') {
        const made = { ...breakfast, ...(body as object), id: 'new', sortOrder: 2 };
        items = [...items, made];
        return json(made, 201);
      }
      if (key.startsWith('PATCH /api/habits/items/')) {
        const id = path.split('/').pop();
        items = items.map((item) => (item.id === id ? { ...item, ...(body as object) } : item));
        return json(items.find((item) => item.id === id));
      }
      if (key.startsWith('DELETE /api/habits/items/')) {
        const id = path.split('/').pop();
        items = items.filter((item) => item.id !== id);
        return json(undefined, 204);
      }
      if (key === 'POST /api/habits/items/reorder') return json(undefined, 204);
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderSettings = () =>
  render(
    <SettingsProvider>
      <HabitsSettings />
    </SettingsProvider>,
  );
const bodyOf = (calls: { key: string; body: unknown }[], key: string) => calls.find((call) => call.key === key)?.body;

async function openNewItem() {
  renderSettings();
  await userEvent.click(await screen.findByRole('button', { name: 'Add an item' }));
  return screen.getByRole('dialog');
}

describe('HabitsSettings', () => {
  it('lists the routine with each item’s points and timing', async () => {
    mockApi();
    renderSettings();
    const routine = await screen.findByRole('list', { name: 'Routine' });
    const rows = within(routine).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Breakfast');
    expect(rows[0]).toHaveTextContent('5 points');
    expect(rows[0]).toHaveTextContent('By 08:30');
    expect(rows[1]).toHaveTextContent('Fajr prayer');
  });

  it('adds a fixed item, sending hundredths and the times given', async () => {
    const calls = mockApi();
    const dialog = await openNewItem();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Snack');
    await userEvent.type(within(dialog).getByLabelText('Points'), '2.5');
    await userEvent.type(within(dialog).getByLabelText('Opens at'), '11:00');
    await userEvent.type(within(dialog).getByLabelText('Due at'), '11:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to routine' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(bodyOf(calls, 'POST /api/habits/items')).toEqual({
      name: 'Snack',
      points: 250,
      timing: { kind: 'fixed', start: '11:00', due: '11:30' },
      appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] },
      lateShare: null,
      missMultiplier: null,
      reminders: { channels: ['push'], onOpen: true, onDue: true, warn: true },
      ignoreQuietHours: false,
    });
  });

  it('adds a prayer, with an optional narrower window', async () => {
    const calls = mockApi();
    const dialog = await openNewItem();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Zuhr');
    await userEvent.type(within(dialog).getByLabelText('Points'), '5');
    await userEvent.selectOptions(within(dialog).getByLabelText('Kind'), 'prayer');
    await userEvent.selectOptions(within(dialog).getByLabelText('Prayer'), 'zuhr');
    await userEvent.type(within(dialog).getByLabelText('Not before'), '13:00');
    await userEvent.type(within(dialog).getByLabelText('Not after'), '13:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to routine' }));

    await waitFor(() =>
      expect(bodyOf(calls, 'POST /api/habits/items')).toMatchObject({
        timing: { kind: 'prayer', prayer: 'zuhr', start: '13:00', end: '13:30' },
      }),
    );
  });

  it('adds a repeating item, on chosen days, email off', async () => {
    const calls = mockApi();
    const dialog = await openNewItem();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Water');
    await userEvent.type(within(dialog).getByLabelText('Points'), '5');
    await userEvent.selectOptions(within(dialog).getByLabelText('Kind'), 'repeating');
    // Only this kind's fields are shown.
    expect(within(dialog).queryByLabelText('Due at')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Prayer')).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('From'), '09:00');
    await userEvent.type(within(dialog).getByLabelText('Until'), '21:00');
    await userEvent.clear(within(dialog).getByLabelText('Every (minutes)'));
    await userEvent.type(within(dialog).getByLabelText('Every (minutes)'), '90');
    await userEvent.clear(within(dialog).getByLabelText('Times a day'));
    await userEvent.type(within(dialog).getByLabelText('Times a day'), '8');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Friday' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to routine' }));

    await waitFor(() =>
      expect(bodyOf(calls, 'POST /api/habits/items')).toMatchObject({
        timing: { kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 },
        appliesTo: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 6] },
        reminders: { channels: ['push'] },
      }),
    );
  });

  it('can apply to kinds of day instead of weekdays', async () => {
    const calls = mockApi();
    const dialog = await openNewItem();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Class notes');
    await userEvent.type(within(dialog).getByLabelText('Points'), '5');
    await userEvent.selectOptions(within(dialog).getByLabelText('Which days'), 'dayTypes');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Class day' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to routine' }));
    await waitFor(() =>
      expect(bodyOf(calls, 'POST /api/habits/items')).toMatchObject({ appliesTo: { kind: 'dayTypes', dayTypeIds: ['classday'] } }),
    );
  });

  it('edits an item; an emptied override is sent as null', async () => {
    const calls = mockApi();
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Breakfast' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Points')).toHaveValue('5');
    expect(within(dialog).getByLabelText('Due at')).toHaveValue('08:30');
    const share = within(dialog).getByLabelText('Share kept when late (%)');
    expect(share).toHaveValue('80');
    await userEvent.clear(share);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(bodyOf(calls, 'PATCH /api/habits/items/breakfast')).toMatchObject({ lateShare: null, points: 500 }));
  });

  it('shows a server error beside the field it names', async () => {
    mockApi({
      'POST /api/habits/items': () => ({
        status: 400,
        body: { message: 'Some fields are not valid', errors: [{ path: 'timing.due', message: 'The due time must be later than the start' }] },
      }),
    });
    const dialog = await openNewItem();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Snack');
    await userEvent.type(within(dialog).getByLabelText('Points'), '5');
    await userEvent.type(within(dialog).getByLabelText('Opens at'), '11:30');
    await userEvent.type(within(dialog).getByLabelText('Due at'), '11:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to routine' }));
    expect(await within(dialog).findByText('The due time must be later than the start')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Due at')).toBeInvalid();
  });

  it('refuses bad points without asking the server', async () => {
    const calls = mockApi();
    const dialog = await openNewItem();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Snack');
    await userEvent.type(within(dialog).getByLabelText('Points'), 'lots');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to routine' }));
    expect(within(dialog).getByLabelText('Points')).toBeInvalid();
    expect(bodyOf(calls, 'POST /api/habits/items')).toBeUndefined();
  });

  it('pauses and resumes an item', async () => {
    const calls = mockApi();
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Pause Breakfast' }));
    await waitFor(() => expect(bodyOf(calls, 'PATCH /api/habits/items/breakfast')).toEqual({ paused: true }));
    expect(await screen.findByRole('button', { name: 'Resume Breakfast' })).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('asks before removing an item', async () => {
    const calls = mockApi();
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Fajr' }));
    expect(calls.some((call) => call.key === 'DELETE /api/habits/items/fajr')).toBe(false);
    expect(screen.getByText(/Past days keep it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }));
    await waitFor(() => expect(calls.some((call) => call.key === 'DELETE /api/habits/items/fajr')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit Fajr' })).not.toBeInTheDocument());
  });

  it('moves an item down, sending the whole order', async () => {
    const calls = mockApi();
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Move Breakfast down' }));
    await waitFor(() => expect(bodyOf(calls, 'POST /api/habits/items/reorder')).toEqual({ ids: ['fajr', 'breakfast'] }));
  });

  it('the rules form sends only what changed', async () => {
    const calls = mockApi();
    renderSettings();
    const rules = await screen.findByRole('region', { name: 'Scoring and prayer times' });
    const late = within(rules).getByLabelText('Share kept when late (%)');
    expect(late).toHaveValue('50');
    await userEvent.clear(late);
    await userEvent.type(late, '60');
    await userEvent.selectOptions(within(rules).getByLabelText('Asr'), 'standard');
    await userEvent.click(within(rules).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(bodyOf(calls, 'PATCH /api/settings')).toEqual({
        'habits.lateShare': 0.6,
        'habits.prayer': { method: 'Karachi', asr: 'standard' },
      }),
    );
  });

  it('shows today’s prayer times under the method', async () => {
    mockApi();
    renderSettings();
    const rules = await screen.findByRole('region', { name: 'Scoring and prayer times' });
    expect(await within(rules).findByText(/Fajr 4:55 am/)).toBeInTheDocument();
  });
});
