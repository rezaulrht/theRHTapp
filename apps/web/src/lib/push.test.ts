import { disablePush, enablePush, isIos, pushState, urlBase64ToUint8Array } from './push';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface Env {
  userAgent?: string;
  standalone?: boolean;
  push?: boolean;
  permission?: NotificationPermission;
  subscription?: object | null;
}

const fakeSubscription = {
  endpoint: 'https://push.example.test/device-1',
  toJSON: () => ({ endpoint: 'https://push.example.test/device-1', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

function setEnv({ userAgent = DESKTOP, standalone = false, push = true, permission = 'default', subscription = null }: Env) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscription),
    subscribe: vi.fn().mockResolvedValue(fakeSubscription),
  };
  const registration = { pushManager };
  vi.stubGlobal('navigator', {
    userAgent,
    maxTouchPoints: userAgent === IPHONE ? 5 : 0,
    standalone: userAgent === IPHONE ? standalone : undefined,
    ...(push
      ? {
          serviceWorker: {
            getRegistration: vi.fn().mockResolvedValue(registration),
            register: vi.fn().mockResolvedValue(registration),
            ready: Promise.resolve(registration),
          },
        }
      : {}),
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: standalone && query.includes('standalone'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  if (push) {
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', {
      permission,
      requestPermission: vi.fn().mockResolvedValue(permission === 'default' ? 'granted' : permission),
    });
  } else {
    vi.stubGlobal('PushManager', undefined);
    vi.stubGlobal('Notification', undefined);
  }
  return pushManager;
}

function mockFetch() {
  const calls: { key: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ key: `${init?.method ?? 'GET'} ${url}`, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (url === '/api/push/public-key') {
        return new Response(JSON.stringify({ key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 204 });
    }),
  );
  return calls;
}

describe('isIos', () => {
  it('recognises an iPhone and an iPad that reports itself as a Mac', () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 5)).toBe(true);
  });

  it('does not mistake a Mac or a PC for one', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 0)).toBe(false);
    expect(isIos(DESKTOP, 0)).toBe(false);
  });
});

describe('pushState', () => {
  it('needs-install: an iPhone browsing in Safari, not from the home screen', async () => {
    setEnv({ userAgent: IPHONE, standalone: false, push: false });
    expect(await pushState()).toBe('needs-install');
  });

  it('unsupported: a browser without push', async () => {
    setEnv({ push: false });
    expect(await pushState()).toBe('unsupported');
  });

  it('unsupported: an installed iPhone app too old for push', async () => {
    setEnv({ userAgent: IPHONE, standalone: true, push: false });
    expect(await pushState()).toBe('unsupported');
  });

  it('denied: the owner blocked notifications', async () => {
    setEnv({ permission: 'denied' });
    expect(await pushState()).toBe('denied');
  });

  it('default: not asked yet', async () => {
    setEnv({ permission: 'default' });
    expect(await pushState()).toBe('default');
  });

  it('default: allowed, but this device has no subscription', async () => {
    setEnv({ permission: 'granted', subscription: null });
    expect(await pushState()).toBe('default');
  });

  it('subscribed: allowed and subscribed', async () => {
    setEnv({ permission: 'granted', subscription: fakeSubscription });
    expect(await pushState()).toBe('subscribed');
  });

  it('subscribed: on an installed iPhone app', async () => {
    setEnv({ userAgent: IPHONE, standalone: true, permission: 'granted', subscription: fakeSubscription });
    expect(await pushState()).toBe('subscribed');
  });
});

describe('enablePush', () => {
  it('asks permission, subscribes with the server key, and registers the device', async () => {
    const pushManager = setEnv({ permission: 'default' });
    const calls = mockFetch();

    await enablePush();

    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    const options = pushManager.subscribe.mock.calls[0]![0] as PushSubscriptionOptionsInit;
    expect(options.userVisibleOnly).toBe(true);
    expect((options.applicationServerKey as Uint8Array).length).toBe(65);
    expect(calls.find((call) => call.key === 'POST /api/push/subscriptions')!.body).toEqual({
      endpoint: 'https://push.example.test/device-1',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('stops with a clear message when the owner says no', async () => {
    setEnv({ permission: 'denied' });
    const calls = mockFetch();
    await expect(enablePush()).rejects.toThrow('Notifications were not allowed');
    expect(calls).toHaveLength(0);
  });
});

describe('disablePush', () => {
  it('unsubscribes the device and tells the server', async () => {
    setEnv({ permission: 'granted', subscription: fakeSubscription });
    const calls = mockFetch();
    await disablePush();
    expect(fakeSubscription.unsubscribe).toHaveBeenCalled();
    expect(calls.find((call) => call.key === 'DELETE /api/push/subscriptions')!.body).toEqual({
      endpoint: 'https://push.example.test/device-1',
    });
  });

  it('does nothing when there is no subscription', async () => {
    setEnv({ permission: 'granted', subscription: null });
    const calls = mockFetch();
    await disablePush();
    expect(calls).toHaveLength(0);
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes url-safe base64 without padding', () => {
    expect([...urlBase64ToUint8Array('AQID-_8')]).toEqual([1, 2, 3, 251, 255]);
  });
});
