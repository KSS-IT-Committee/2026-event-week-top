import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";

import { sessions } from "@/db/schema";
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
 */

// Renew a session's expiry at most once per hour (or every half TTL when the
// TTL is shorter), so a burst of page loads doesn't become a burst of writes.
const RENEW_AFTER_SECONDS = 60 * 60;

export type SessionUser = {
  username: string;
};

// The DB stores only this hash; the cookie holds the raw token. A leaked
// sessions table therefore can't be replayed as cookies.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function validateSessionToken(
  token: string,
): Promise<SessionUser | null> {
  const [session] = await db
    .select()
    .from(sessions)
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

  return { username: session.username };
}

/**
 * The logged-in user for the current request, or null. Reads the session
 * cookie, so any page using it renders dynamically. Renews the session's
 * expiry as a side effect (see validateSessionToken). Deduplicated per
 * request via React cache().
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
