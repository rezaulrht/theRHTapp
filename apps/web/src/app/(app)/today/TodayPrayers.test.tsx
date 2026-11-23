import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import { SettingsProvider } from '@/components/SettingsProvider';
import { TodayPrayers } from './TodayPrayers';

vi.mock('next/navigation', () => ({
  usePathname: () => '/today',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// 12:00 noon in Dhaka on Friday 13 November 2026 (06:00 UTC).
const NOW = new Date('2026-11-13T06:00:00Z');

const dhaka = (time: string, day = '2026-11-13') => new Date(`${day}T${time}:00+06:00`).toISOString();
const timesFor = (day: string) => ({
  day,
  fajr: dhaka('05:00', day),
  sunrise: dhaka('06:15', day),
  zuhr: dhaka('11:45', day),
  asr: dhaka('15:05', day),
  maghrib: dhaka('17:15', day),
  isha: dhaka('18:35', day),
});

function mockApi(fail = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.split('?')[0]!;
      const json = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (path === '/api/settings') return json(defaultSettings);
      if (path === '/api/habits/prayer-times') {
        if (fail) return json({ message: 'Nope' }, 500);
        const day = new URL(url, 'http://x').searchParams.get('day')!;
        return json(timesFor(day));
      }
      return json({}, 404);
    }),
  );
}

describe('TodayPrayers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('lists the five prayers, marks the running one and counts down to the next', async () => {
    mockApi();
    render(
      <SettingsProvider>
        <TodayPrayers />
      </SettingsProvider>,
    );

    await waitFor(() => expect(screen.getByText('Prayer times')).toBeInTheDocument());
    for (const name of ['Fajr', 'Zuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText('5:00 am')).toBeInTheDocument();
    expect(screen.getByText('3:05 pm')).toBeInTheDocument();

    const running = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'true')!;
    expect(within(running).getByText('Zuhr')).toBeInTheDocument();
    expect(screen.getByText(/Asr in 3 h 05 min/)).toBeInTheDocument();
    expect(screen.getByText(/Dhaka/)).toBeInTheDocument();
  });

  it('shows nothing when the times cannot be loaded', async () => {
    mockApi(true);
    const { container } = render(
      <SettingsProvider>
        <TodayPrayers />
      </SettingsProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
