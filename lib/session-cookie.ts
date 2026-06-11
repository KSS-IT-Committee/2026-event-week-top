/**
 * Shared session-cookie contract for the 2026 KSS-IT apps.
 *
 * This file must stay byte-identical across the app repos, and it is
 * imported by proxy.ts, so it must not pull in server-only modules or the
 * database client.
 *
 * Environment:
 * - SESSION_COOKIE_DOMAIN — "2026.kss-it.com" in production, so the cookie
 *   is shared by every app and PR preview under that domain. Leave it unset
 *   for local dev and vvps: a host-only cookie on 127.0.0.1 is still sent to
 *   every port, so cross-app login keeps working there.
 * - SESSION_TTL_SECONDS — session lifetime, default 2 days. Expiry slides on
 *   access: proxy.ts re-stamps the cookie and lib/session.ts renews the DB
 *   row, so a session only dies after a full TTL without any access.
 */

export const SESSION_COOKIE_NAME = "kss_session";

export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 2;

export function getSessionTtlSeconds(): number {
  const raw = process.env.SESSION_TTL_SECONDS;
  if (!raw) return DEFAULT_SESSION_TTL_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  return parsed;
}

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  domain?: string;
};

export function sessionCookieOptions(): SessionCookieOptions {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getSessionTtlSeconds(),
    ...(domain ? { domain } : {}),
  };
}
