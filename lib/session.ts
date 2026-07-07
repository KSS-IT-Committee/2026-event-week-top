import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { sessions, users } from "@/db/schema";
import { db } from "@/lib/db";
import {
  getSessionTtlSeconds,
  SESSION_COOKIE_NAME,
} from "@/lib/session-cookie";

/**
 * Shared login-session core for the 2026 KSS-IT apps. Sessions live in the
 * shared `appdata` database (canonical schema: 2026-db), so a login made on
 * event-week-top is visible to every app; the cookie side of the contract
 * lives in lib/session-cookie.ts. This file must stay byte-identical across
 * the app repos.
 *
 * PR previews are the one exception to "read the DB directly": a preview runs
 * against a schema-only clone of `appdata` (no users, no sessions) through a
 * role that cannot even reach the production DB, so it cannot validate the
 * shared login cookie locally. When IS_PR_PREVIEW is set, validateSessionToken
 * instead RESOLVES the cookie against the auth host — production event-week-top,
 * which owns the real `appdata` — over a read-only server-to-server call (see
 * validateSessionTokenViaAuthHost). The cookie already reaches the preview: it
 * is scoped to the whole SESSION_COOKIE_DOMAIN, so the browser sends it to every
 * `*.<domain>` subdomain, preview subdomains included.
 *
 * Only validation is delegated — deliberately read-only. createSession is never
 * reached on a preview (the clone has no users, so login fails there), and
 * invalidateSession is a no-op on a preview (logout clears the shared cookie and
 * the production row expires on its own), so a preview can never mutate a real
 * session.
 */

// Renew a session's expiry at most once per hour (or every half TTL when the
// TTL is shorter), so a burst of page loads doesn't become a burst of writes.
const RENEW_AFTER_SECONDS = 60 * 60;

export type SessionUser = {
  username: string;
  // Authorization roles (see lib/access.ts), carried on the session so PR
  // previews — which resolve the cookie via the auth host and have no local
  // `users` table to read — can gate on roles just like production. Typed as
  // string[], not the Role enum, so this byte-identical file stays decoupled
  // from each app's schema; lib/access.ts narrows these against ROLENAMES.
  roles: string[];
};

// The DB stores only this hash; the cookie holds the raw token. A leaked
// sessions table therefore can't be replayed as cookies.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/* ──────────── auth-host passthrough (PR previews only, read-only) ──────────── */

// True only inside a PR-preview container. IS_PR_PREVIEW is injected at runtime
// by the deploy infra (never in production or local dev / vvps, and deliberately
// NOT a NEXT_PUBLIC_ var), so production and dev always take the direct-DB paths.
function isPreviewRuntime(): boolean {
  return process.env.IS_PR_PREVIEW === "true";
}

// Base URL of the auth host a preview delegates to. Defaults to the namespace
// apex (https://2026.kss-it.com), which production event-week-top serves.
// PREVIEW_AUTH_HOST overrides it with an in-cluster address (e.g.
// http://<event-week-top-container>:3000) when a preview container can't hairpin
// back out to nginx for its own public domain; http is acceptable there because
// it stays on the trusted Docker `web` network (the same network the apps
// already use to reach Postgres in the clear).
function authHostBaseUrl(): string | null {
  const override = process.env.PREVIEW_AUTH_HOST;
  if (override) return override.replace(/\/$/, "");
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  return domain ? `https://${domain}` : null;
}

// Resolve a session token by asking the auth host's read-only /api/session
// endpoint. The token and the shared secret travel in headers (never the URL,
// never a cookie), so they aren't logged and the endpoint is immune to CSRF.
// Fails closed — returns null ("logged out") — when the preview is misconfigured
// (no host or secret), the auth host is unreachable, or the response is unusable.
async function validateSessionTokenViaAuthHost(
  token: string,
): Promise<SessionUser | null> {
  const base = authHostBaseUrl();
  const secret = process.env.PREVIEW_AUTH_SECRET;
  if (base === null || !secret) return null;

  let response: Response;
  try {
    response = await fetch(`${base}/api/session`, {
      method: "GET",
      headers: {
        "x-session-token": token,
        "x-preview-auth-secret": secret,
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const { username, roles } = data as { username?: unknown; roles?: unknown };
  if (typeof username !== "string" || username === "") return null;
  // Roles only drive gating; if the host omits them or sends an unexpected
  // shape, fall back to none (role checks then deny, class checks still work)
  // rather than rejecting the whole session.
  const safeRoles =
    Array.isArray(roles) && roles.every((role) => typeof role === "string")
      ? (roles as string[])
      : [];
  return { username, roles: safeRoles };
}

/* ─────────────────────────────── direct DB path ─────────────────────────────── */

// Validate + slide a session against the real `appdata`. Exported so the auth
// host's /api/session route resolves tokens straight against the DB it owns,
// never through validateSessionToken's preview branch (which would let a
// mis-flagged auth host recurse into itself).
export async function validateSessionTokenViaDb(
  token: string,
): Promise<SessionUser | null> {
  // Join users so the session carries the user's roles (see SessionUser). The
  // sessions.username FK cascades on user delete, so a session can never
  // outlive its user — the inner join can't drop an otherwise-valid session.
  const [session] = await db
    .select({
      id: sessions.id,
      username: sessions.username,
      expiresAt: sessions.expiresAt,
      roles: users.roles,
    })
    .from(sessions)
    .innerJoin(users, eq(users.username, sessions.username))
    .where(eq(sessions.id, hashToken(token)));
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  const ttlSeconds = getSessionTtlSeconds();
  const renewAfterSeconds = Math.min(
    RENEW_AFTER_SECONDS,
    Math.floor(ttlSeconds / 2),
  );
  const renewAtMs =
    session.expiresAt.getTime() - (ttlSeconds - renewAfterSeconds) * 1000;
  if (now >= renewAtMs) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now + ttlSeconds * 1000) })
      .where(eq(sessions.id, session.id));
  }

  return { username: session.username, roles: session.roles };
}

/* ─────────────────────────────────── public API ─────────────────────────────────── */

export async function createSession(username: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ttlSeconds = getSessionTtlSeconds();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  // Opportunistic cleanup: logins are rare enough that sweeping expired rows
  // here keeps the table small without needing a scheduled job.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db
    .insert(sessions)
    .values({ id: hashToken(token), username, expiresAt });
  return token;
}

export async function invalidateSession(token: string): Promise<void> {
  // On a preview there is no local session row to delete (the clone is empty),
  // and we deliberately do NOT reach into production to delete the real row:
  // logout clears the shared cookie (see app/login/actions.ts) and the
  // production session then expires on its own. Keeping previews read-only means
  // preview code can never destroy a real user's session.
  if (isPreviewRuntime()) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function validateSessionToken(
  token: string,
): Promise<SessionUser | null> {
  if (isPreviewRuntime()) return validateSessionTokenViaAuthHost(token);
  return validateSessionTokenViaDb(token);
}

/**
 * The logged-in user for the current request, or null. Reads the session
 * cookie, so any page using it renders dynamically. Renews the session's
 * expiry as a side effect (see validateSessionToken). Deduplicated per
 * request via React cache().
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (process.env.LOCAL_DEV_USER && process.env.NODE_ENV === "development") {
    return {
      username: process.env.LOCAL_DEV_USER,
      roles: (process.env.LOCAL_DEV_ROLES?.split(/[,\s]+/).filter(Boolean) ??
        []) as string[],
    };
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
