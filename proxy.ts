import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session-cookie";

/**
 * Re-stamp the session cookie's Max-Age on every page access so the cookie
 * lifetime slides together with the DB-side expiry (lib/session.ts renews
 * the row; without this the cookie would hard-expire one TTL after login no
 * matter how active the user is). No DB access here on purpose: the DB row
 * stays authoritative — re-stamping a cookie whose session row is gone just
 * keeps sending a token that no longer matches anything.
 *
 * Must stay byte-identical across the app repos.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    response.cookies.set(
      SESSION_COOKIE_NAME,
      sessionCookie.value,
      sessionCookieOptions(),
    );
  }
  return response;
}

export const config = {
  // Skip Next.js internals and obvious static assets; pages and server
  // actions are what should slide the session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
