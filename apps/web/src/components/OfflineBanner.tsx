'use client';

import { useEffect, useState } from 'react';

/** A bar across the top while the device has no connection. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-alert px-5 py-2 text-center text-sm font-medium text-ground"
    >
      No connection
    </div>
  );
}
