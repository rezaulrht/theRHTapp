import { defaultSettings } from '@pa/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '@/components/SettingsProvider';
import { WeeklyReviewSettings } from './WeeklyReviewSettings';

function mockApi() {
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
      if (key === 'PATCH /api/settings') return json({ ...defaultSettings, ...(body as object) });
      if (key === 'POST /api/ai/weekly-review/now') return json({ text: 'A good week: you spent less than last week.' });
      throw new Error(`Unexpected request: ${key}`);
    }),
  );
  return calls;
}

const renderIt = () =>
  render(
    <SettingsProvider>
      <WeeklyReviewSettings />
    </SettingsProvider>,
  );

describe('WeeklyReviewSettings', () => {
  it('starts off, on Sunday at 8 pm, by notification', async () => {
    mockApi();
    renderIt();
    expect(await screen.findByLabelText('Send me a weekly review')).not.toBeChecked();
    expect(screen.getByLabelText('Day')).toHaveValue('0');
    expect(screen.getByLabelText('Time')).toHaveValue('20:00');
    expect(screen.getByLabelText('Notification')).toBeChecked();
    expect(screen.getByLabelText('Email')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves the changed plan as one setting', async () => {
    const calls = mockApi();
    renderIt();
    await userEvent.click(await screen.findByLabelText('Send me a weekly review'));
    await userEvent.selectOptions(screen.getByLabelText('Day'), 'Friday');
    await userEvent.click(screen.getByLabelText('Email'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(calls.find((call) => call.key === 'PATCH /api/settings')?.body).toEqual({
      'ai.weeklyReview': { enabled: true, day: 5, time: '20:00', channels: ['push', 'email'] },
    });
  });

  it('writes and shows a review on request', async () => {
    mockApi();
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Send one now' }));
    expect(await screen.findByText('A good week: you spent less than last week.')).toBeInTheDocument();
  });

  it('shows nothing without the settings provider', () => {
    const { container } = render(<WeeklyReviewSettings />);
    expect(container).toBeEmptyDOMElement();
  });
});
