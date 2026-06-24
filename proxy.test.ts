import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session-cookie";

const { nextMock } = vi.hoisted(() => {
  return { nextMock: vi.fn() };
});

vi.mock("next/server", () => {
  return {
    NextResponse: {
      next: nextMock,
    },
  };
});

import { config, proxy } from "@/proxy";

type FakeResponse = {
  cookies: { set: ReturnType<typeof vi.fn> };
};

function makeResponse(): FakeResponse {
  return { cookies: { set: vi.fn() } };
}

function makeRequest(cookie: { value: string } | undefined): NextRequest {
  return {
    cookies: {
      get: vi.fn((name: string) => {
        if (name === SESSION_COOKIE_NAME) return cookie;
        return undefined;
      }),
    },
  } as unknown as NextRequest;
}

function unset(name: string): void {
  vi.stubEnv(name, undefined as unknown as string);
}

describe("proxy", () => {
  let response: FakeResponse;

  beforeEach(() => {
    unset("SESSION_COOKIE_DOMAIN");
    unset("SESSION_TTL_SECONDS");
    unset("NODE_ENV");
    response = makeResponse();
    nextMock.mockReturnValue(response);
  });

  it("returns the NextResponse.next() object", () => {
    const result = proxy(makeRequest(undefined));
    expect(result).toBe(response);
    expect(nextMock).toHaveBeenCalledTimes(1);
  });

  it("re-stamps the cookie when the session cookie has a value", () => {
    proxy(makeRequest({ value: "tok-123" }));
    expect(response.cookies.set).toHaveBeenCalledTimes(1);
    expect(response.cookies.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "tok-123",
      sessionCookieOptions(),
    );
  });

  it("passes the real sessionCookieOptions() (domain + ttl honored)", () => {
    vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    vi.stubEnv("SESSION_TTL_SECONDS", "3600");
    vi.stubEnv("NODE_ENV", "production");
    proxy(makeRequest({ value: "abc" }));
    expect(response.cookies.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "abc",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 3600,
        domain: "2026.kss-it.com",
      },
    );
  });

  it("omits domain and sets secure:false outside production (default ttl)", () => {
    // SESSION_COOKIE_DOMAIN / SESSION_TTL_SECONDS / NODE_ENV are unset by
    // beforeEach, so this exercises the no-domain + non-production +
    // default-TTL branch of the real sessionCookieOptions().
    proxy(makeRequest({ value: "tok" }));
    expect(response.cookies.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = response.cookies.set.mock.calls[0];
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(value).toBe("tok");
    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_SESSION_TTL_SECONDS,
    });
    expect("domain" in options).toBe(false);
  });

  it("does NOT set the cookie when no session cookie is present", () => {
    proxy(makeRequest(undefined));
    expect(response.cookies.set).not.toHaveBeenCalled();
  });

  it("does NOT set the cookie when the cookie value is empty", () => {
    proxy(makeRequest({ value: "" }));
    expect(response.cookies.set).not.toHaveBeenCalled();
  });

  it("does NOT set the cookie when the cookie has no value field", () => {
    // A cookie object present but with undefined value still hits the
    // sessionCookie?.value falsy branch.
    proxy(makeRequest({ value: undefined } as unknown as { value: string }));
    expect(response.cookies.set).not.toHaveBeenCalled();
  });

  it("looks up the cookie by SESSION_COOKIE_NAME", () => {
    const request = makeRequest({ value: "tok" });
    proxy(request);
    expect(request.cookies.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
  });
});

describe("config.matcher", () => {
  it("is an array with a single matcher string", () => {
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher).toHaveLength(1);
    expect(typeof config.matcher[0]).toBe("string");
  });

  it("excludes the documented Next internals and static assets", () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
    expect(pattern).toContain("favicon.ico");
    expect(pattern).toContain("sitemap.xml");
    expect(pattern).toContain("robots.txt");
  });

  describe("derived regex matching", () => {
    const regex = new RegExp(`^${config.matcher[0]}$`);

    it.each(["/dashboard", "/login", "/", "/api/session"])(
      "matches the application path %s",
      (path) => {
        expect(regex.test(path)).toBe(true);
      },
    );

    it.each([
      "/_next/static/chunk.js",
      "/_next/image",
      "/favicon.ico",
      "/sitemap.xml",
      "/robots.txt",
    ])("excludes %s", (path) => {
      expect(regex.test(path)).toBe(false);
    });
  });
});
