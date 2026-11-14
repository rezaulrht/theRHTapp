import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as push from '@/lib/push';
import { InstallGuide } from './InstallGuide';
import { OfflineBanner } from './OfflineBanner';
import { PushControl } from './PushControl';

vi.mock('@/lib/push', async (original) => ({
  ...(await original<typeof push>()),
  isIos: vi.fn(),
  isStandalone: vi.fn(),
  pushState: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
}));

describe('InstallGuide', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the three steps on an iPhone that has not installed the app', async () => {
    vi.mocked(push.isIos).mockReturnValue(true);
    vi.mocked(push.isStandalone).mockReturnValue(false);
    render(<InstallGuide />);
    expect(await screen.findByText('Add this app to your home screen')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it('is hidden once the app runs from the home screen', async () => {
    vi.mocked(push.isIos).mockReturnValue(true);
    vi.mocked(push.isStandalone).mockReturnValue(true);
    const { container } = render(<InstallGuide />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden on other devices', async () => {
    vi.mocked(push.isIos).mockReturnValue(false);
    vi.mocked(push.isStandalone).mockReturnValue(false);
    const { container } = render(<InstallGuide />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('stays hidden after being dismissed', async () => {
    vi.mocked(push.isIos).mockReturnValue(true);
    vi.mocked(push.isStandalone).mockReturnValue(false);
    const first = render(<InstallGuide />);
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    const second = render(<InstallGuide />);
    await act(async () => {});
    expect(second.container).toBeEmptyDOMElement();
  });

  it('can be shown regardless of dismissal, for the notifications page', async () => {
    vi.mocked(push.isIos).mockReturnValue(true);
    vi.mocked(push.isStandalone).mockReturnValue(false);
    localStorage.setItem('pa.installGuide.dismissed', '1');
    render(<InstallGuide always />);
    expect(await screen.findByText('Add this app to your home screen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();
  });
});

describe('OfflineBanner', () => {
  it('appears while offline and goes when back online', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByText('No connection')).not.toBeInTheDocument();

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText('No connection')).toBeInTheDocument();

    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText('No connection')).not.toBeInTheDocument();
  });
});

describe('PushControl', () => {
  it('offers to turn notifications on, and confirms once on', async () => {
    vi.mocked(push.pushState).mockResolvedValueOnce('default').mockResolvedValue('subscribed');
    vi.mocked(push.enablePush).mockResolvedValue();
    render(<PushControl />);

    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications on this device' }));

    expect(push.enablePush).toHaveBeenCalled();
    expect(await screen.findByText('Notifications are on for this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
  });

  it('shows why turning on failed', async () => {
    vi.mocked(push.pushState).mockResolvedValue('default');
    vi.mocked(push.enablePush).mockRejectedValue(new Error('Notifications were not allowed'));
    render(<PushControl />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on notifications on this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed');
  });

  it('turns notifications off', async () => {
    vi.mocked(push.pushState).mockResolvedValueOnce('subscribed').mockResolvedValue('default');
    vi.mocked(push.disablePush).mockResolvedValue();
    render(<PushControl />);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(push.disablePush).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Turn on notifications on this device' })).toBeInTheDocument();
  });

  it('explains how to install first on an iPhone in Safari', async () => {
    vi.mocked(push.pushState).mockResolvedValue('needs-install');
    vi.mocked(push.isIos).mockReturnValue(true);
    vi.mocked(push.isStandalone).mockReturnValue(false);
    render(<PushControl />);
    expect(await screen.findByText('Add this app to your home screen')).toBeInTheDocument();
  });

  it('explains how to allow notifications again when blocked', async () => {
    vi.mocked(push.pushState).mockResolvedValue('denied');
    render(<PushControl />);
    expect(await screen.findByText(/Notifications are blocked for this app/)).toBeInTheDocument();
  });

  it('says so when the browser cannot do notifications', async () => {
    vi.mocked(push.pushState).mockResolvedValue('unsupported');
    render(<PushControl />);
    expect(await screen.findByText(/This browser cannot show notifications/)).toBeInTheDocument();
  });
});
