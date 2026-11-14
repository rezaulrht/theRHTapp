'use client';

import { Button, Panel } from '@pa/ui';
import { useEffect, useState } from 'react';
import { isIos, isStandalone } from '@/lib/push';

const DISMISSED_KEY = 'pa.installGuide.dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * How to put the app on an iPhone's home screen. iOS has no install prompt,
 * and only sends notifications to apps opened from the home screen. Shown on
 * an iPhone in Safari until dismissed; `always` shows it regardless.
 */
export function InstallGuide({ always = false }: { always?: boolean }) {
  // Decided after mount: the server cannot know what device this is.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isIos() && !isStandalone() && (always || !wasDismissed()));
  }, [always]);

  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private browsing: it will simply show again next time.
    }
    setVisible(false);
  }

  return (
    <Panel className="mb-8 border border-hairline">
      <h2 className="font-display text-2xl text-ivory">Add this app to your home screen</h2>
      <p className="mt-2 text-sage">
        It then opens full screen like any other app, and can send you notifications.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-ivory marker:text-brass">
        <li>Tap the Share button in Safari&apos;s toolbar.</li>
        <li>Choose &ldquo;Add to Home Screen&rdquo;.</li>
        <li>Open the app from its new icon and log in.</li>
      </ol>
      {always ? null : (
        <Button variant="quiet" className="mt-4 -ml-6" onClick={dismiss}>
          Not now
        </Button>
      )}
    </Panel>
  );
}
