import { defaultSettings } from '@pa/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { SettingsProvider } from '@/components/SettingsProvider';
import { GeneralForm } from './general/GeneralForm';
import { NotificationsForm } from './notifications/NotificationsForm';
import { outcomeText, TestReminder } from './notifications/TestReminder';
import { SecurityForm } from './security/SecurityForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

type Handler = (init: RequestInit | undefined) => { status: number; body?: unknown };

/** Routes fetch calls by "METHOD /path" and records every call. */
function mockApi(routes: Record<string, Handler>) {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`;
      calls.push({ key, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const handler = routes[key];
      if (!handler) throw new Error(`Unexpected request: ${key}`);
      const { status, body } = handler(init);
      return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

const withSettings = (ui: ReactNode) => <SettingsProvider>{ui}</SettingsProvider>;
const loadDefaults: Handler = () => ({ status: 200, body: defaultSettings });

describe('GeneralForm', () => {
  it('shows the saved values', async () => {
    mockApi({ 'GET /api/settings': loadDefaults });
    render(withSettings(<GeneralForm />));
    expect(await screen.findByLabelText('Time zone')).toHaveValue('Asia/Dhaka');
    expect(screen.getByLabelText('Currency symbol')).toHaveValue('৳');
    expect(screen.getByLabelText('Friday')).toHaveValue('classday');
    expect(screen.getByLabelText('Saturday')).toHaveValue('workday');
  });

  it('lists the week starting on Saturday', async () => {
    mockApi({ 'GET /api/settings': loadDefaults });
    render(withSettings(<GeneralForm />));
    await screen.findByLabelText('Time zone');
    const week = screen.getByRole('group', { name: 'Week pattern' });
    const labels = within(week)
      .getAllByRole('combobox')
      .map((select) => select.getAttribute('aria-label') ?? (select as HTMLSelectElement).labels?.[0]?.textContent);
    expect(labels).toEqual(['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  });

  it('sends only the settings that changed, then confirms', async () => {
    const calls = mockApi({
      'GET /api/settings': loadDefaults,
      'PATCH /api/settings': (init) => ({
        status: 200,
        body: { ...defaultSettings, ...JSON.parse(init!.body as string) },
      }),
    });
    render(withSettings(<GeneralForm />));
    const symbol = await screen.findByLabelText('Currency symbol');
    await userEvent.clear(symbol);
    await userEvent.type(symbol, 'Tk');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Saved');
    const patch = calls.find((call) => call.key === 'PATCH /api/settings')!;
    expect(patch.body).toEqual({ 'general.currency': { symbol: 'Tk', code: 'BDT' } });
  });

  it('does not call the server when nothing changed', async () => {
    const calls = mockApi({ 'GET /api/settings': loadDefaults });
    render(withSettings(<GeneralForm />));
    await screen.findByLabelText('Time zone');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(calls.filter((call) => call.key.startsWith('PATCH'))).toHaveLength(0);
  });

  it('adds a day type and offers it in the week pattern', async () => {
    mockApi({ 'GET /api/settings': loadDefaults });
    render(withSettings(<GeneralForm />));
    await screen.findByLabelText('Time zone');
    await userEvent.click(screen.getByRole('button', { name: 'Add day type' }));
    const names = screen.getAllByLabelText(/^Day type \d+ name$/);
    await userEvent.type(names[names.length - 1]!, 'Holiday');
    expect(within(screen.getByLabelText('Friday')).getByRole('option', { name: 'Holiday' })).toBeInTheDocument();
  });

  it('shows the server message beside the field it is about', async () => {
    mockApi({
      'GET /api/settings': loadDefaults,
      'PATCH /api/settings': () => ({
        status: 400,
        body: {
          message: 'Some settings are not valid',
          errors: [{ path: 'general.timezone', message: 'Unknown time zone' }],
        },
      }),
    });
    render(withSettings(<GeneralForm />));
    const zone = await screen.findByLabelText('Time zone');
    await userEvent.clear(zone);
    await userEvent.type(zone, 'Mars/Olympus');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const error = await screen.findByText('Unknown time zone');
    expect(zone.getAttribute('aria-describedby')).toBe(error.id);
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

describe('NotificationsForm', () => {
  it('shows a server error for the quiet hours start beside that field', async () => {
    mockApi({
      'GET /api/settings': loadDefaults,
      'PATCH /api/settings': () => ({
        status: 400,
        body: {
          message: 'Some settings are not valid',
          errors: [{ path: 'general.quietHours.start', message: 'Use a 24-hour time such as 05:30' }],
        },
      }),
    });
    render(withSettings(<NotificationsForm />));
    await userEvent.click(await screen.findByLabelText('Quiet hours'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const error = await screen.findByText('Use a 24-hour time such as 05:30');
    expect(screen.getByLabelText('Quiet from').getAttribute('aria-describedby')).toBe(error.id);
  });

  it('saves the notification email', async () => {
    const calls = mockApi({
      'GET /api/settings': loadDefaults,
      'PATCH /api/settings': (init) => ({
        status: 200,
        body: { ...defaultSettings, ...JSON.parse(init!.body as string) },
      }),
    });
    render(withSettings(<NotificationsForm />));
    await userEvent.type(await screen.findByLabelText('Email for reminders'), 'me@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved');
    expect(calls.find((call) => call.key === 'PATCH /api/settings')!.body).toEqual({
      'general.notificationEmail': 'me@example.test',
    });
  });
});

describe('TestReminder', () => {
  it('reports each channel in plain words', async () => {
    mockApi({
      'POST /api/reminders/test': () => ({
        status: 200,
        body: {
          deliveries: [
            { channel: 'push', status: 'sent', error: null },
            { channel: 'email', status: 'failed', error: 'No notification email is set' },
          ],
        },
      }),
      'GET /api/reminders/deliveries?limit=50': () => ({ status: 200, body: [] }),
    });
    render(<TestReminder />);
    await userEvent.click(screen.getByRole('button', { name: 'Send test reminder' }));

    expect(await screen.findByText('Phone notification: Sent')).toBeInTheDocument();
    expect(screen.getByText('Email: Not sent. No notification email is set')).toBeInTheDocument();
  });

  it('lists recent deliveries', async () => {
    mockApi({
      'GET /api/reminders/deliveries?limit=50': () => ({
        status: 200,
        body: [
          {
            id: 'd1',
            title: 'Test reminder',
            channel: 'email',
            status: 'suppressed',
            error: null,
            occurrenceAt: '2026-11-13T04:00:00.000Z',
            createdAt: '2026-11-13T04:00:00.000Z',
          },
        ],
      }),
    });
    render(<TestReminder />);
    const row = await screen.findByRole('listitem');
    expect(row).toHaveTextContent('Test reminder');
    expect(row).toHaveTextContent('Email');
    expect(row).toHaveTextContent('Held back by quiet hours');
  });

  it('says so when the request fails', async () => {
    mockApi({
      'POST /api/reminders/test': () => ({ status: 500, body: { message: 'Internal server error' } }),
      'GET /api/reminders/deliveries?limit=50': () => ({ status: 200, body: [] }),
    });
    render(<TestReminder />);
    await userEvent.click(screen.getByRole('button', { name: 'Send test reminder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
  });
});

describe('SecurityForm', () => {
  it('changes the password and confirms', async () => {
    const calls = mockApi({ 'POST /api/auth/change-password': () => ({ status: 204 }) });
    render(<SecurityForm />);
    await userEvent.type(screen.getByLabelText('Current password'), 'old password here');
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await screen.findByText('Password changed. Other devices were logged out.');
    expect(calls[0]!.body).toEqual({
      currentPassword: 'old password here',
      newPassword: 'a brand new password',
    });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('shows a wrong current password beside that field', async () => {
    mockApi({
      'POST /api/auth/change-password': () => ({
        status: 400,
        body: {
          message: 'Some fields are not valid',
          errors: [{ path: 'currentPassword', message: 'Current password is wrong' }],
        },
      }),
    });
    render(<SecurityForm />);
    await userEvent.type(screen.getByLabelText('Current password'), 'nope');
    await userEvent.type(screen.getByLabelText('New password'), 'a brand new password');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    const error = await screen.findByText('Current password is wrong');
    expect(screen.getByLabelText('Current password').getAttribute('aria-describedby')).toBe(error.id);
  });

  it('logs out', async () => {
    const calls = mockApi({ 'POST /api/auth/logout': () => ({ status: 204 }) });
    render(<SecurityForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(calls.map((call) => call.key)).toContain('POST /api/auth/logout'));
  });
});

describe('outcomeText', () => {
  it.each([
    ['sent', null, 'Sent'],
    ['failed', 'No device is subscribed', 'Not sent. No device is subscribed'],
    ['missed', null, 'Missed while the server was down'],
    ['suppressed', null, 'Held back by quiet hours'],
    ['skipped', null, 'Not needed'],
  ])('%s reads as plain words', (status, error, text) => {
    expect(outcomeText({ channel: 'push', status, error })).toBe(text);
  });
});
