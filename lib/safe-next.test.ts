import { afterEach, describe, expect, it, vi } from "vitest";

import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  describe("non-string and relative-path behavior (env-independent)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns '/' for non-string input (null)", () => {
      expect(safeNextPath(null)).toBe("/");
    });

    it("returns a simple relative path unchanged", () => {
      expect(safeNextPath("/foo")).toBe("/foo");
    });

    it("preserves search and hash on a relative path", () => {
      expect(safeNextPath("/foo?a=1&b=2#frag")).toBe("/foo?a=1&b=2#frag");
    });

    it("returns '/' for '/'", () => {
      expect(safeNextPath("/")).toBe("/");
    });

    it("returns '/' for a protocol-relative URL '//evil.com'", () => {
      expect(safeNextPath("//evil.com")).toBe("/");
    });

    it("returns '/' for a backslash escape '/\\evil.com'", () => {
      const result = safeNextPath("/\\evil.com");
      expect(result).toBe("/");
    });

    it("returns '/' for a backslash escape with path '/\\evil.com/x'", () => {
      const result = safeNextPath("/\\evil.com/x");
      expect(result.startsWith("/")).toBe(true);
      expect(result).not.toContain("evil.com");
    });

    it("returns '/' when a control char (tab) changes the resolved origin", () => {
      // "/\t/evil.com" — the tab lets the URL parser treat this as
      // protocol-relative ("//evil.com"), escaping to a foreign origin.
      const result = safeNextPath("/\t/evil.com");
      expect(result).toBe("/");
    });

    it("returns '/' when a newline control char changes the origin", () => {
      const result = safeNextPath("/\n/evil.com");
      expect(result).toBe("/");
    });

    it("keeps a tab-in-path input same-origin and '/'-rooted", () => {
      // A tab inside an ordinary path is stripped but stays same-origin.
      const result = safeNextPath("/foo\tbar");
      expect(result.startsWith("/")).toBe(true);
      expect(result).not.toMatch(/^\/\//);
    });

    it("normalizes a same-origin dot-dot path to a '/'-rooted path", () => {
      const result = safeNextPath("/a/../b");
      expect(result.startsWith("/")).toBe(true);
      expect(result).not.toContain("evil.com");
    });
  });

  describe("absolute URLs with SESSION_COOKIE_DOMAIN = '2026.kss-it.com'", () => {
    function setDomain() {
      vi.stubEnv("SESSION_COOKIE_DOMAIN", "2026.kss-it.com");
    }

    it("returns an https URL whose host equals the domain", () => {
      setDomain();
      expect(safeNextPath("https://2026.kss-it.com/login")).toBe(
        "https://2026.kss-it.com/login",
      );
    });

    it("returns an https URL on a subdomain in the family", () => {
      setDomain();
      expect(safeNextPath("https://equipment.2026.kss-it.com/x?y=1")).toBe(
        "https://equipment.2026.kss-it.com/x?y=1",
      );
    });

    it("rejects http (non-https) on an allowed host", () => {
      setDomain();
      expect(safeNextPath("http://2026.kss-it.com/x")).toBe("/");
    });

    it("rejects an unrelated host", () => {
      setDomain();
      expect(safeNextPath("https://evil.com/x")).toBe("/");
    });

    it("rejects a suffix attack host ending in '.evil.com'", () => {
      setDomain();
      expect(safeNextPath("https://2026.kss-it.com.evil.com/x")).toBe("/");
    });

    it("rejects a host that does not end with '.2026.kss-it.com'", () => {
      setDomain();
      expect(safeNextPath("https://evil2026.kss-it.com/x")).toBe("/");
    });

    it("rejects a javascript: pseudo-URL", () => {
      setDomain();
      expect(safeNextPath("javascript:alert(1)")).toBe("/");
    });

    it("rejects an ftp: URL on an allowed host", () => {
      setDomain();
      expect(safeNextPath("ftp://2026.kss-it.com")).toBe("/");
    });

    it("rejects an unparseable, non-slash-prefixed string", () => {
      setDomain();
      expect(safeNextPath("not a url at all")).toBe("/");
    });

    it("still resolves a relative path", () => {
      setDomain();
      expect(safeNextPath("/foo")).toBe("/foo");
    });
  });

  describe("absolute URLs with SESSION_COOKIE_DOMAIN unset", () => {
    function unsetDomain() {
      vi.stubEnv("SESSION_COOKIE_DOMAIN", undefined as unknown as string);
    }

    it("confirms the env var is actually unset", () => {
      unsetDomain();
      expect(process.env.SESSION_COOKIE_DOMAIN).toBeUndefined();
    });

    it("rejects an https URL that would otherwise be allowed", () => {
      unsetDomain();
      expect(safeNextPath("https://2026.kss-it.com/login")).toBe("/");
    });

    it("rejects a subdomain https URL", () => {
      unsetDomain();
      expect(safeNextPath("https://equipment.2026.kss-it.com/x")).toBe("/");
    });

    it("still resolves a relative path", () => {
      unsetDomain();
      expect(safeNextPath("/foo")).toBe("/foo");
    });
  });
});
