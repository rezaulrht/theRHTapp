import { NextResponse, type NextRequest } from 'next/server';
import { redirectFor, SESSION_COOKIE } from '@/lib/route-guard';

/** Runs before each page: sends logged-out visitors to the login page. */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const target = redirectFor(pathname, search, request.cookies.has(SESSION_COOKIE));
  return target ? NextResponse.redirect(new URL(target, request.url)) : NextResponse.next();
}

export const config = {
  // Pages only. The API, Next's own files and static assets are left alone.
  matcher: ['/((?!api/|_next/|icons/|sw\\.js|offline\\.html|manifest\\.webmanifest|favicon\\.ico|.*\\.(?:png|svg|ico|webp)$).*)'],
};
