import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import type { DayScore, ItemStats } from '@/lib/habits';
import { habitToday } from '@/lib/habits-text';
import { addDays } from '@/lib/money-text';
import { ProgressView, weekOf } from './ProgressView';

vi.mock('next/navigation', () => ({
  usePathname: () => '/habits/progress',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const today = habitToday('Asia/Dhaka', 4);
const week = weekOf(today);
/** A range never runs past today. */
const thisWeek = { from: week.from, to: week.to < today ? week.to : today };

const days: DayScore[] = [
  { day: week.from, score: 4250, possible: 6000, target: 4200, won: true, skipped: false },
  { day: addDays(week.from, 1), score: -500, possible: 6000, target: 4200, won: false, skipped: false },
  { day: addDays(week.from, 2), score: 0, possible: 0, target: 0, won: null, skipped: true },
];
const items: ItemStats[] = [
  { itemId: 'gym', name: 'Gym', archived: false, lost: 3750, missed: 3, late: 0, onTime: 2, applied: 5, missRate: 0.6, current: 0, best: 2 },
  { itemId: 'sleep', name: 'Sleep', archived: false, lost: 750, missed: 0, late: 3, onTime: 2, applied: 5, missRate: 0, current: 5, best: 14 },
  { itemId: 'old', name: 'Old habit', archived: true, lost: 250, missed: 0, late: 1, onTime: 0, applied: 1, missRate: 0, current: 1, best: 1 },
  { itemId: 'new', name: 'Reading', archived: false, lost: 0, missed: 0, late: 0, onTime: 0, applied: 0, missRate: 0, current: 0, best: 0 },
];

function mockApi(answer: { days: DayScore[]; items: ItemStats[] } = { days, items }) {
  const asked: { from: string; to: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const [path = '', query = ''] = url.split('?');
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (path === '/api/settings') return json(defaultSettings);
      if (path === '/api/habits/stats') {
        const search = new URLSearchParams(query);
        asked.push({ from: search.get('from')!, to: search.get('to')! });
        return json(search.get('from') === week.from ? answer : { days: [], items: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  return asked;
}

const renderProgress = () =>
  render(
    <SettingsProvider>
      <ProgressView />
    </SettingsProvider>,
  );

describe('weekOf', () => {
  it('runs Saturday to Friday, as the owner’s week does', () => {
    // 15 November 2026 is a Sunday.
    expect(weekOf('2026-11-15')).toEqual({ from: '2026-11-14', to: '2026-11-20' });
    expect(weekOf('2026-11-14')).toEqual({ from: '2026-11-14', to: '2026-11-20' });
    expect(weekOf('2026-11-20')).toEqual({ from: '2026-11-14', to: '2026-11-20' });
  });
});

describe('ProgressView', () => {
  it('asks for this week first, and gives each day a bar that reads its score', async () => {
    const asked = mockApi();
    renderProgress();
    const chart = await screen.findByRole('list', { name: 'Daily scores' });
    expect(asked[0]).toEqual(thisWeek);
    const bars = within(chart).getAllByRole('link');
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveAccessibleName(expect.stringMatching(/: 42\.5 of 60, won$/));
    expect(bars[1]).toHaveAccessibleName(expect.stringMatching(/: −5 of 60, lost$/));
    expect(bars[2]).toHaveAccessibleName(expect.stringMatching(/: skipped$/));
    expect(bars[0]).toHaveAttribute('href', `/habits?day=${week.from}`);
    expect(screen.getByText('1 won, 1 lost')).toBeInTheDocument();
  });

  it('ranks the weakest items by points lost, with how often each was missed', async () => {
    mockApi();
    renderProgress();
    const ranking = await screen.findByRole('list', { name: 'Weakest items' });
    const rows = within(ranking).getAllByRole('listitem');
    // An item that lost nothing is not among the weakest.
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Gym');
    expect(rows[0]).toHaveTextContent('−37.5');
    expect(rows[0]).toHaveTextContent('Missed 3 of 5 days');
    expect(rows[1]).toHaveTextContent('Never missed in 5 days');
    expect(rows[2]).toHaveTextContent('Old habit');
    expect(rows[2]).toHaveTextContent('archived');
  });

  it('shows every item’s streak', async () => {
    mockApi();
    renderProgress();
    const streaks = await screen.findByRole('list', { name: 'Streaks' });
    expect(within(streaks).getByText('5 days, best 14')).toBeInTheDocument();
    expect(within(streaks).getByText('1 day, best 1')).toBeInTheDocument();
    expect(within(streaks).getByText('No streak yet')).toBeInTheDocument();
  });

  it('switches to the month, goes back, and never past today', async () => {
    const asked = mockApi();
    renderProgress();
    await screen.findByRole('list', { name: 'Daily scores' });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Month' }));
    await waitFor(() => expect(asked.at(-1)).toEqual({ from: `${today.slice(0, 7)}-01`, to: today }));

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(asked.at(-1)).toEqual({ from: addDays(week.from, -7), to: addDays(week.from, -1) }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('says so when there is nothing to show yet', async () => {
    mockApi({ days: [], items: [] });
    renderProgress();
    expect(await screen.findByText('No days to show yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Weakest items' })).not.toBeInTheDocument();
  });
});
