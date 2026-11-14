export const HOME = '/today';
export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'pa_session';

/** Pages anyone may open without logging in. */
const OPEN_PATHS = ['/login', '/offline'];

/**
 * Where to go after logging in. Only paths inside this app are honoured, so a
 * crafted link cannot bounce the owner to another site.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return HOME;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return HOME;
  return next;
}

/**
 * Decides whether a page request should be sent elsewhere. Returns the path
 * to redirect to, or null to let it through. This only looks at whether a
 * session cookie is present; the back end decides whether it is valid.
 */
export function redirectFor(pathname: string, search: string, hasSession: boolean): string | null {
  if (pathname === '/login') return hasSession ? HOME : null;
  if (OPEN_PATHS.includes(pathname)) return null;
  if (hasSession) return pathname === '/' ? HOME : null;
  if (pathname === '/') return '/login';
  return `/login?next=${encodeURIComponent(pathname + search)}`;
}
