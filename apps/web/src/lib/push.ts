import { api } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'denied' | 'subscribed';

const SERVICE_WORKER = '/sw.js';

/** True on iPhone and iPad. An iPad reports itself as a Mac, so touch support is the tell. */
export function isIos(
  userAgent: string = navigator.userAgent,
  maxTouchPoints: number = navigator.maxTouchPoints ?? 0,
): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** True when the app was opened from the home screen rather than in a browser tab. */
export function isStandalone(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return displayMode || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined' &&
    typeof Notification !== 'undefined'
  );
}

/** Where this device stands on phone notifications. */
export async function pushState(): Promise<PushState> {
  // iOS only offers push to apps on the home screen, so in a Safari tab the
  // answer is to install first, whatever else is missing.
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'subscribed' : 'default';
}

export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Turns on notifications for this device. Must be called from a tap or click:
 * browsers only show the permission prompt in response to one.
 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot show notifications');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed');

  await navigator.serviceWorker.register(SERVICE_WORKER);
  const registration = await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>('/push/public-key');
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }));
  await api('/push/subscriptions', { method: 'POST', json: subscription.toJSON() });
}

/** Turns notifications off for this device only. */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await api('/push/subscriptions', { method: 'DELETE', json: { endpoint } });
}
