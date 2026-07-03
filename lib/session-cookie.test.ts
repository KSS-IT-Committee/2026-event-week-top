import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SESSION_TTL_SECONDS,
  getLoginBaseUrl,
  getSessionTtlSeconds,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session-cookie";

function unset(name: string): void {
  vi.stubEnv(name, undefined as unknown as string);
}

describe("session-cookie constants", () => {
  it("SESSION_COOKIE_NAME is 'kss_session'", () => {
    expect(SESSION_COOKIE_NAME).toBe("kss_session");
  });

  it("DEFAULT_SESSION_TTL_SECONDS is 172800 (2 days)", () => {
    expect(DEFAULT_SESSION_TTL_SECONDS).toBe(172800);
    expect(DEFAULT_SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 2);
  });
});

describe("getLoginBaseUrl", () => {
  beforeEach(() => {
    unset("SESSION_COOKIE_DOMAIN");
    unset("LOGIN_ORIGIN");
  });

  it("returns https URL from SESSION_COOKIE_DOMAIN", () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    expect(getLoginBaseUrl()).toBe("https://2026.kss-it.com/login");
  });

  it("falls back to LOGIN_ORIGIN when domain unset", () => {
    vi.stubEnv("LOGIN_ORIGIN", "http://localhost:3000");
    expect(getLoginBaseUrl()).toBe("http://localhost:3000/login");
  });

  it("trims a single trailing slash from LOGIN_ORIGIN", () => {
    vi.stubEnv("LOGIN_ORIGIN", "http://localhost:3000/");
    expect(getLoginBaseUrl()).toBe("http://localhost:3000/login");
  });

  it("returns relative '/login' when both unset", () => {
    expect(getLoginBaseUrl()).toBe("/login");
  });

  it("domain wins when both are set", () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("LOGIN_ORIGIN", "http://localhost:3000");
    expect(getLoginBaseUrl()).toBe("https://2026.kss-it.com/login");
  });
});

describe("getSessionTtlSeconds", () => {
  beforeEach(() => {
    unset("SESSION_TTL_SECONDS");
  });

  it("returns default when unset", () => {
    expect(getSessionTtlSeconds()).toBe(172800);
  });

  it("parses a valid positive integer", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "3600");
    expect(getSessionTtlSeconds()).toBe(3600);
  });

  it("rejects 0 and returns default", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "0");
    expect(getSessionTtlSeconds()).toBe(172800);
  });

  it("rejects negative values and returns default", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "-5");
    expect(getSessionTtlSeconds()).toBe(172800);
  });

  it("returns default for non-numeric (NaN) input", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "abc");
    expect(getSessionTtlSeconds()).toBe(172800);
  });

  it("returns default for empty string (falsy)", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "");
    expect(getSessionTtlSeconds()).toBe(172800);
  });

  it("truncates a decimal via base-10 parseInt", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "12.5");
    expect(getSessionTtlSeconds()).toBe(12);
  });

  it("tolerates surrounding whitespace", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "  60  ");
    expect(getSessionTtlSeconds()).toBe(60);
  });
});

describe("sessionCookieOptions", () => {
  beforeEach(() => {
    unset("SESSION_COOKIE_DOMAIN");
    unset("SESSION_TTL_SECONDS");
    unset("NODE_ENV");
  });

  it("always sets httpOnly, sameSite 'lax', and path '/'", () => {
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  it("maxAge reflects SESSION_TTL_SECONDS when set", () => {
    vi.stubEnv("SESSION_TTL_SECONDS", "3600");
    expect(sessionCookieOptions().maxAge).toBe(3600);
  });

  it("maxAge defaults to 172800 when SESSION_TTL_SECONDS unset", () => {
    expect(sessionCookieOptions().maxAge).toBe(172800);
  });

  it("secure is true in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it("secure is false in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("secure is false in test env", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("includes domain when SESSION_COOKIE_DOMAIN is set", () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    const opts = sessionCookieOptions();
    expect(opts.domain).toBe("2026.kss-it.com");
  });

  it("omits the domain key entirely when unset", () => {
    const opts = sessionCookieOptions();
    expect("domain" in opts).toBe(false);
  });
});
