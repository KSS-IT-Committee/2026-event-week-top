import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import { SITE_URL } from "@/lib/site";

function disallowed() {
  const { rules } = robots();
  // The single-rule form; an array would mean the policy was restructured.
  expect(Array.isArray(rules)).toBe(false);
  return (rules as { disallow?: string[] }).disallow ?? [];
}

describe("robots", () => {
  it("allows the site by default", () => {
    const { rules } = robots();

    expect((rules as { allow?: string }).allow).toBe("/");
    expect((rules as { userAgent?: string }).userAgent).toBe("*");
  });

  it("points at the sitemap on the canonical origin", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("disallows every login-gated route", () => {
    expect(disallowed()).toEqual(
      expect.arrayContaining([
        "/api/",
        "/chat",
        "/login",
        "/lottery$",
        "/lottery/",
        "/seat",
      ]),
    );
  });

  it("does not disallow the public /lottery-external via a bare /lottery prefix", () => {
    // robots.txt matches by prefix: a bare "/lottery" would also match
    // "/lottery-external", which is public. Hence the "$" + "/" pair.
    expect(disallowed()).not.toContain("/lottery");
  });

  it("does not disallow any public route", () => {
    const rules = disallowed();

    ["/", "/news/list", "/sousaku-list", "/requests", "/changelog"].forEach(
      (route) => {
        expect(rules).not.toContain(route);
      },
    );
  });
});
