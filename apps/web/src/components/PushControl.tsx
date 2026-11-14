'use client';

import { Button } from '@pa/ui';
import { useCallback, useEffect, useState } from 'react';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { InstallGuide } from './InstallGuide';

/** Turns phone notifications on or off for the device in the owner's hand. */
export function PushControl() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await pushState());
    } catch {
      setState('unsupported');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    } finally {
      await refresh();
      setBusy(false);
    }
  }

  if (state === null) return <p className="text-sage">Checking this device…</p>;

  return (
    <div>
      {state === 'default' ? (
        // The permission prompt only appears in response to this tap.
        <Button loading={busy} onClick={() => run(enablePush)}>
          Turn on notifications on this device
        </Button>
      ) : null}

      {state === 'subscribed' ? (
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-ivory">Notifications are on for this device</p>
          <Button variant="outline" loading={busy} onClick={() => run(disablePush)}>
            Turn off
          </Button>
        </div>
      ) : null}

      {state === 'needs-install' ? <InstallGuide always /> : null}

      {state === 'denied' ? (
        <p className="max-w-prose text-sage">
          Notifications are blocked for this app. To allow them on an iPhone, open the Settings app, go
          to Notifications, find this app and switch on Allow Notifications. In a desktop browser, use
          the site settings beside the address bar.
        </p>
      ) : null}

      {state === 'unsupported' ? (
        <p className="max-w-prose text-sage">
          This browser cannot show notifications. On an iPhone they need iOS 16.4 or newer. Reminders
          can still reach you by email.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
