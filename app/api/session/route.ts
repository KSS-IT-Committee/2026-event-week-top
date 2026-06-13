import { timingSafeEqual } from "node:crypto";

import { NextRequest } from "next/server";

import { validateSessionTokenViaDb } from "@/lib/session";

/**
 * Internal auth-host endpoint, called only by PR-preview app servers.
 *
 * A preview runs against a schema-only clone of `appdata` and so cannot validate
 * the shared login cookie itself (see lib/session.ts). It forwards the cookie's
 * token here — to production event-week-top, which serves the namespace apex and
 * owns the real `appdata` — over a read-only server-to-server call:
 *
 *   GET /api/session  →  resolve the token to { username }.
 *
 * It is intentionally read-only: there is no logout/DELETE here, so the only
 * capability this grants a caller is resolving a token they already hold to a
 * username. Logout is handled entirely by clearing the shared cookie; the
 * production session row then expires on its own.
 *
 * Authorization is a shared secret (PREVIEW_AUTH_SECRET) carried in a header,
 * NOT in the cookie, so the endpoint is immune to CSRF and the secret never
 * reaches the browser. Only the username is ever returned — never password
 * hashes or session tokens. It fails closed: with PREVIEW_AUTH_SECRET unset the
 * endpoint denies every request, so it is inert until the infra wires the secret
 * into both production and the preview containers.
 *
 * Resolution goes through validateSessionTokenViaDb (the direct-DB path), never
 * validateSessionToken, so even if this host were ever mis-flagged as a preview
 * it would still read its own DB instead of recursing back into /api/session.
 */

// This identity endpoint must run per request. Reading request headers already
// forces dynamic rendering; force-dynamic just makes that explicit and survives
// a future refactor. Proxy/CDN caching is prevented separately by the no-store
// Cache-Control header set on every response below.
export const dynamic = "force-dynamic";

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; the length check leaks only the
  // secret's length, which is not sensitive.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.PREVIEW_AUTH_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-preview-auth-secret");
  if (provided === null) return false;
  return timingSafeEqualStr(provided, expected);
}

function getRequestToken(request: NextRequest): string | null {
  const token = request.headers.get("x-session-token");
  if (token === null || token === "") return null;
  return token;
}

const NO_STORE = { "cache-control": "no-store" };

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  const token = getRequestToken(request);
  if (token === null) {
    return Response.json(
      { error: "missing token" },
      { status: 400, headers: NO_STORE },
    );
  }
  const user = await validateSessionTokenViaDb(token);
  if (user === null) {
    return Response.json(
      { error: "invalid session" },
      { status: 401, headers: NO_STORE },
    );
  }
  return Response.json({ username: user.username }, { headers: NO_STORE });
}
