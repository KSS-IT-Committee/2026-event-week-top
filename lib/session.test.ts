import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSession,
  getCurrentUser,
  invalidateSession,
  validateSessionToken,
  validateSessionTokenViaDb,
} from "@/lib/session";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";

// ── DB mock ───────────────────────────────────────────────────────────────
// A chainable Drizzle stub. SELECT chains are thenable and resolve to the
// canned rows in `selectHolder.rows`; the write chains (insert/update/delete)
// are thenable and resolve to undefined. Every terminal method records its
// args into `calls` so a test can assert which path ran and with what payload.
const { selectHolder, calls } = vi.hoisted(() => ({
  selectHolder: { rows: [] as unknown[] },
  calls: {
    select: [] as unknown[][],
    from: [] as unknown[][],
    innerJoin: [] as unknown[][],
    selectWhere: [] as unknown[][],
    insert: [] as unknown[][],
    values: [] as unknown[][],
    update: [] as unknown[][],
    set: [] as unknown[][],
    updateWhere: [] as unknown[][],
    delete: [] as unknown[][],
    deleteWhere: [] as unknown[][],
  },
}));

vi.mock("@/lib/db", () => {
  // A thenable chain object. `record` names the terminal-method bucket used for
  // the chain's `where`; `resolve` is what awaiting the chain yields.
  function makeChain(whereBucket: keyof typeof calls, resolve: () => unknown) {
    const handler: ProxyHandler<() => void> = {
      get(_t, prop) {
        if (prop === "then") {
          const p = Promise.resolve(resolve());
          return p.then.bind(p);
        }
        if (prop === "catch") {
          const p = Promise.resolve(resolve());
          return p.catch.bind(p);
        }
        if (prop === "finally") {
          const p = Promise.resolve(resolve());
          return p.finally.bind(p);
        }
        if (prop === "from") {
          return (...args: unknown[]) => {
            calls.from.push(args);
            return chain;
          };
        }
        if (prop === "innerJoin") {
          return (...args: unknown[]) => {
            calls.innerJoin.push(args);
            return chain;
          };
        }
        if (prop === "where") {
          return (...args: unknown[]) => {
            calls[whereBucket].push(args);
            return chain;
          };
        }
        if (prop === "values") {
          return (...args: unknown[]) => {
            calls.values.push(args);
            return chain;
          };
        }
        if (prop === "set") {
          return (...args: unknown[]) => {
            calls.set.push(args);
            return chain;
          };
        }
        return () => chain;
      },
    };
    const chain: unknown = new Proxy(function () {}, handler);
    return chain;
  }

  return {
    db: {
      select: (...args: unknown[]) => {
        calls.select.push(args);
        return makeChain("selectWhere", () => selectHolder.rows);
      },
      insert: (...args: unknown[]) => {
        calls.insert.push(args);
        return makeChain("deleteWhere", () => undefined);
      },
      update: (...args: unknown[]) => {
        calls.update.push(args);
        return makeChain("updateWhere", () => undefined);
      },
      delete: (...args: unknown[]) => {
        calls.delete.push(args);
        return makeChain("deleteWhere", () => undefined);
      },
    },
  };
});

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

// ── helpers ─────────────────────────────────────────────────────────────────
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// drizzle's eq()/lt() build an SQL object whose `queryChunks` interleave static
// fragments ({ value: [" = "] }) with the raw operands (the bound value appears
// as a plain element). These helpers crack open that structure so a test can
// assert the actual filter VALUE that hit the DB (e.g. the hashed id, not the
// raw token) and the comparison OPERATOR (" = " for eq, " < " for lt), rather
// than only that *some* where() ran.
type SqlLike = { queryChunks: unknown[] };

function operatorOf(condition: unknown): string | undefined {
  const chunks = (condition as SqlLike).queryChunks;
  for (const chunk of chunks) {
    const value = (chunk as { value?: unknown }).value;
    if (
      Array.isArray(value) &&
      typeof value[0] === "string" &&
      value[0].trim() !== ""
    ) {
      return value[0].trim();
    }
  }
  return undefined;
}

// drizzle binds the operand in a Param whose `.value` is the real bound value
// ({ brand: "Param", value, encoder }). Static fragments are StringChunks whose
// `.value` is an ARRAY of literal SQL text, and columns carry a `.table`. So the
// bound operand is the element whose `.value` exists and is NOT an array.
function boundValueOf(condition: unknown): unknown {
  const chunks = (condition as SqlLike).queryChunks;
  for (const chunk of chunks) {
    if (chunk === null || typeof chunk !== "object") continue;
    if ("table" in chunk) continue; // column reference
    const value = (chunk as { value?: unknown }).value;
    if (value !== undefined && !Array.isArray(value)) return value;
  }
  return undefined;
}

function resetCalls(): void {
  for (const key of Object.keys(calls) as (keyof typeof calls)[]) {
    calls[key] = [];
  }
}

beforeEach(() => {
  selectHolder.rows = [];
  resetCalls();
  vi.useRealTimers();
});

// ── validateSessionTokenViaDb ─────────────────────────────────────────────────
describe("validateSessionTokenViaDb", () => {
  const TOKEN = "raw-token";

  it("returns null when no session row matches", async () => {
    selectHolder.rows = [];

    const result = await validateSessionTokenViaDb(TOKEN);

    expect(result).toBeNull();
    expect(calls.select).toHaveLength(1);
    expect(calls.delete).toHaveLength(0);
    expect(calls.update).toHaveLength(0);
  });

  it("queries by the sha256 hash of the token (never the raw token)", async () => {
    selectHolder.rows = [];

    await validateSessionTokenViaDb(TOKEN);

    expect(calls.from).toHaveLength(1);
    expect(calls.innerJoin).toHaveLength(1);
    expect(calls.selectWhere).toHaveLength(1);

    // Crack open the eq() filter and assert the BOUND VALUE is the hash, not the
    // raw token — this is the whole point of hashToken (a leaked sessions table
    // can't be replayed as a cookie).
    const [condition] = calls.selectWhere[0] as [unknown];
    expect(operatorOf(condition)).toBe("=");
    expect(boundValueOf(condition)).toBe(hashToken(TOKEN));
    expect(boundValueOf(condition)).not.toBe(TOKEN);
  });

  it("deletes the row and returns null when the session is expired (expiresAt <= now)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    const now = Date.now();

    selectHolder.rows = [
      {
        id: hashToken(TOKEN),
        username: "1A01",
        expiresAt: new Date(now), // exactly now → <= now branch
        roles: ["IT"],
      },
    ];

    const result = await validateSessionTokenViaDb(TOKEN);

    expect(result).toBeNull();
    expect(calls.delete).toHaveLength(1);
    expect(calls.deleteWhere).toHaveLength(1);
    expect(calls.update).toHaveLength(0);
    // Deletes by the matched row's id (= the token hash), via eq().
    const [condition] = calls.deleteWhere[0] as [unknown];
    expect(operatorOf(condition)).toBe("=");
    expect(boundValueOf(condition)).toBe(hashToken(TOKEN));
  });

  it("returns {username, roles} and renews expiry when now >= renewAtMs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    const now = Date.now();

    // Default TTL 172800s; renewAfter = min(3600, 86400) = 3600s. renewAtMs =
    // expiresAt - (172800 - 3600)*1000. Put expiresAt only 100s in the future:
    // far past renewAtMs, so a renewal write fires.
    selectHolder.rows = [
      {
        id: hashToken(TOKEN),
        username: "1A01",
        expiresAt: new Date(now + 100 * 1000),
        roles: ["IT", "Sousakuten"],
      },
    ];

    const result = await validateSessionTokenViaDb(TOKEN);

    expect(result).toEqual({ username: "1A01", roles: ["IT", "Sousakuten"] });
    expect(calls.delete).toHaveLength(0);
    expect(calls.update).toHaveLength(1);
    expect(calls.set).toHaveLength(1);
    // Renewed to now + TTL.
    const [payload] = calls.set[0] as [{ expiresAt: Date }];
    expect(payload.expiresAt.getTime()).toBe(now + 172800 * 1000);
    // The update is scoped to this row's id (the hash), not a blanket update.
    expect(calls.updateWhere).toHaveLength(1);
    const [condition] = calls.updateWhere[0] as [unknown];
    expect(operatorOf(condition)).toBe("=");
    expect(boundValueOf(condition)).toBe(hashToken(TOKEN));
  });

  it("does NOT renew when the session is fresh (now < renewAtMs)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    const now = Date.now();

    // expiresAt = now + TTL (just issued). renewAtMs = now + 3600*1000, which is
    // in the future, so now < renewAtMs → no renewal.
    selectHolder.rows = [
      {
        id: hashToken(TOKEN),
        username: "1A01",
        expiresAt: new Date(now + 172800 * 1000),
        roles: [],
      },
    ];

    const result = await validateSessionTokenViaDb(TOKEN);

    expect(result).toEqual({ username: "1A01", roles: [] });
    expect(calls.update).toHaveLength(0);
    expect(calls.delete).toHaveLength(0);
  });

  it("renews exactly at the renewAtMs boundary (now === renewAtMs)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    const now = Date.now();

    // Choose expiresAt so renewAtMs === now: renewAtMs = expiresAt - 169200*1000,
    // so set expiresAt = now + 169200*1000.
    selectHolder.rows = [
      {
        id: hashToken(TOKEN),
        username: "1A01",
        expiresAt: new Date(now + (172800 - 3600) * 1000),
        roles: [],
      },
    ];

    const result = await validateSessionTokenViaDb(TOKEN);

    expect(result).toEqual({ username: "1A01", roles: [] });
    expect(calls.update).toHaveLength(1);
  });

  it("honors a custom SESSION_TTL_SECONDS for renewAfter = min(3600, ttl/2)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    vi.stubEnv("SESSION_TTL_SECONDS", "1000");
    const now = Date.now();

    // ttl=1000 → renewAfter = min(3600, 500) = 500. renewAtMs = expiresAt -
    // (1000-500)*1000 = expiresAt - 500000. expiresAt = now + 400s → renewAtMs =
    // now - 100000 < now, so it renews to now + 1000s.
    selectHolder.rows = [
      {
        id: hashToken(TOKEN),
        username: "1A01",
        expiresAt: new Date(now + 400 * 1000),
        roles: [],
      },
    ];

    const result = await validateSessionTokenViaDb(TOKEN);

    expect(result).toEqual({ username: "1A01", roles: [] });
    expect(calls.update).toHaveLength(1);
    const [payload] = calls.set[0] as [{ expiresAt: Date }];
    expect(payload.expiresAt.getTime()).toBe(now + 1000 * 1000);
  });
});

// ── createSession ─────────────────────────────────────────────────────────────
describe("createSession", () => {
  it("returns a base64url token and inserts a row keyed by the token's hash", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    const now = Date.now();

    const token = await createSession("1A01");

    // base64url alphabet only: A-Z a-z 0-9 - _ (no +, /, =).
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes → 43-char base64url (no padding).
    expect(token).toHaveLength(43);

    // Sweep first, then insert.
    expect(calls.delete).toHaveLength(1);
    expect(calls.deleteWhere).toHaveLength(1);
    expect(calls.insert).toHaveLength(1);
    expect(calls.values).toHaveLength(1);

    // The sweep is a range delete of expired rows: lt(expiresAt, now) — NOT an
    // eq() on the new token, so it can never wipe the row we are about to add.
    const [sweepCondition] = calls.deleteWhere[0] as [unknown];
    expect(operatorOf(sweepCondition)).toBe("<");
    const sweepValue = boundValueOf(sweepCondition);
    expect(sweepValue).toBeInstanceOf(Date);
    expect((sweepValue as Date).getTime()).toBe(now);

    const [values] = calls.values[0] as [
      { id: string; username: string; expiresAt: Date },
    ];
    expect(values.id).toBe(hashToken(token));
    expect(values.id).not.toBe(token);
    expect(values.username).toBe("1A01");
    expect(values.expiresAt.getTime()).toBe(now + 172800 * 1000);
  });

  it("computes expiresAt from a custom SESSION_TTL_SECONDS", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    vi.stubEnv("SESSION_TTL_SECONDS", "3600");
    const now = Date.now();

    await createSession("1A01");

    const [values] = calls.values[0] as [{ expiresAt: Date }];
    expect(values.expiresAt.getTime()).toBe(now + 3600 * 1000);
  });

  it("returns a distinct token on each call", async () => {
    const a = await createSession("1A01");
    const b = await createSession("1A01");
    expect(a).not.toBe(b);
  });
});

// ── invalidateSession ──────────────────────────────────────────────────────────
describe("invalidateSession", () => {
  it("deletes the row by the hashed id when not a preview runtime", async () => {
    vi.stubEnv("IS_PR_PREVIEW", undefined as unknown as string);

    await invalidateSession("raw-token");

    expect(calls.delete).toHaveLength(1);
    expect(calls.deleteWhere).toHaveLength(1);
    // Deletes by eq(id, hash) — the hashed token, never the raw token.
    const [condition] = calls.deleteWhere[0] as [unknown];
    expect(operatorOf(condition)).toBe("=");
    expect(boundValueOf(condition)).toBe(hashToken("raw-token"));
    expect(boundValueOf(condition)).not.toBe("raw-token");
  });

  it("is a no-op (no delete) when IS_PR_PREVIEW is 'true'", async () => {
    vi.stubEnv("IS_PR_PREVIEW", "true");

    await invalidateSession("raw-token");

    expect(calls.delete).toHaveLength(0);
  });

  it("still deletes when IS_PR_PREVIEW is some other value", async () => {
    vi.stubEnv("IS_PR_PREVIEW", "1");

    await invalidateSession("raw-token");

    expect(calls.delete).toHaveLength(1);
  });
});

// ── validateSessionToken (routing) ─────────────────────────────────────────────
describe("validateSessionToken routing", () => {
  it("takes the direct-DB path when not a preview runtime", async () => {
    vi.stubEnv("IS_PR_PREVIEW", undefined as unknown as string);
    selectHolder.rows = [];

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
    expect(calls.select).toHaveLength(1);
  });

  it("takes the auth-host path when IS_PR_PREVIEW is 'true' (no DB select)", async () => {
    vi.stubEnv("IS_PR_PREVIEW", "true");
    // Misconfigured (no base url / secret) → null, but crucially never selects.
    vi.stubEnv("PREVIEW_AUTH_HOST", undefined as unknown as string);
    vi.stubEnv("SESSION_COOKIE_DOMAIN", undefined as unknown as string);

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
    expect(calls.select).toHaveLength(0);
  });
});

// ── validateSessionTokenViaAuthHost (via validateSessionToken preview path) ──────
describe("validateSessionTokenViaAuthHost", () => {
  beforeEach(() => {
    vi.stubEnv("IS_PR_PREVIEW", "true");
    vi.stubEnv("PREVIEW_AUTH_HOST", undefined as unknown as string);
    vi.stubEnv("SESSION_COOKIE_DOMAIN", undefined as unknown as string);
    vi.stubEnv("PREVIEW_AUTH_SECRET", undefined as unknown as string);
  });

  it("returns null when there is no base url (no host override, no domain)", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when PREVIEW_AUTH_SECRET is unset", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the token + secret in headers (not the URL) and hits /api/session", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ username: "1A01", roles: ["IT"] }),
    }));
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const result = await validateSessionToken("my-token");

    expect(result).toEqual({ username: "1A01", roles: ["IT"] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://2026.kss-it.com/api/session");
    expect(url).not.toContain("my-token");
    expect(url).not.toContain("s3cret");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-session-token"]).toBe("my-token");
    expect(headers["x-preview-auth-secret"]).toBe("s3cret");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
  });

  it("prefers PREVIEW_AUTH_HOST over the domain and trims a trailing slash", async () => {
    vi.stubEnv("PREVIEW_AUTH_HOST", "http://ewt:3000/");
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ username: "1A01", roles: [] }),
    }));
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    await validateSessionToken("tok");

    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://ewt:3000/api/session");
  });

  it("falls back to the domain when PREVIEW_AUTH_HOST is the empty string", async () => {
    // Empty string is falsy → the override is ignored and the domain wins.
    vi.stubEnv("PREVIEW_AUTH_HOST", "");
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ username: "1A01", roles: [] }),
    }));
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    await validateSessionToken("tok");

    const [url] = fetchSpy.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://2026.kss-it.com/api/session");
  });

  it("returns null when fetch throws (host unreachable)", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("returns null when the response is not ok", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("returns null when the body is not valid JSON", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("returns null when the body is not an object (e.g. a string)", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => "nope",
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("returns null when the body is JSON null", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => null,
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("returns null when username is missing", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ roles: ["IT"] }),
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("returns null when username is the empty string", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ username: "", roles: ["IT"] }),
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toBeNull();
  });

  it("sanitizes roles to [] when they are not all strings", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ username: "1A01", roles: ["IT", 42] }),
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toEqual({ username: "1A01", roles: [] });
  });

  it("sanitizes roles to [] when roles is not an array", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ username: "1A01", roles: "IT" }),
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toEqual({ username: "1A01", roles: [] });
  });

  it("returns {username, roles} on the happy path with all-string roles", async () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ username: "1A01", roles: ["IT", "Taiikusai"] }),
      })) as unknown as typeof fetch,
    );

    const result = await validateSessionToken("tok");

    expect(result).toEqual({ username: "1A01", roles: ["IT", "Taiikusai"] });
  });
});

// ── getCurrentUser ─────────────────────────────────────────────────────────────
describe("getCurrentUser", () => {
  type CookieStore = { get: ReturnType<typeof vi.fn> };

  function stubCookies(store: CookieStore): void {
    vi.mocked(cookies).mockResolvedValue(store as never);
  }

  it("returns null when there is no session cookie", async () => {
    vi.stubEnv("IS_PR_PREVIEW", undefined as unknown as string);
    const store: CookieStore = { get: vi.fn(() => undefined) };
    stubCookies(store);

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(store.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    // Never reaches validation → no DB select.
    expect(calls.select).toHaveLength(0);
  });

  it("returns null when the cookie value is the empty string", async () => {
    vi.stubEnv("IS_PR_PREVIEW", undefined as unknown as string);
    const store: CookieStore = { get: vi.fn(() => ({ value: "" })) };
    stubCookies(store);

    const result = await getCurrentUser();

    expect(result).toBeNull();
    expect(calls.select).toHaveLength(0);
  });

  it("delegates to validation (direct-DB path) when a token is present", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    vi.stubEnv("IS_PR_PREVIEW", undefined as unknown as string);
    const now = Date.now();

    const store: CookieStore = {
      get: vi.fn(() => ({ value: "the-token" })),
    };
    stubCookies(store);
    selectHolder.rows = [
      {
        id: hashToken("the-token"),
        username: "1A01",
        expiresAt: new Date(now + 172800 * 1000),
        roles: ["IT"],
      },
    ];

    const result = await getCurrentUser();

    expect(result).toEqual({ username: "1A01", roles: ["IT"] });
    expect(store.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
    expect(calls.select).toHaveLength(1);
  });
});
