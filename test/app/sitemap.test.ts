import { describe, expect, it, vi } from "vitest";

import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

const FIXTURE = vi.hoisted(() => [
  {
    slug: "public-post",
    id: "public-post",
    title: "Public",
    date: "2026-02-01T09:00:00.000Z",
    tag: "info",
    internal: false,
    roles: [] as string[],
    content: "",
    contentHtml: "",
  },
  {
    slug: "internal-post",
    id: "internal-post",
    title: "Internal",
    date: "2026-01-15T12:30:00.000Z",
    tag: "info",
    internal: true,
    roles: [] as string[],
    content: "",
    contentHtml: "",
  },
  {
    slug: "role-restricted-post",
    id: "role-restricted-post",
    title: "IT only",
    date: "2026-03-20T18:45:00.000Z",
    tag: "itcommittee",
    internal: false,
    roles: ["IT"] as string[],
    content: "",
    contentHtml: "",
  },
]);

vi.mock("@/lib/posts.generated.json", () => ({ default: FIXTURE }));
vi.mock("./posts.generated.json", () => ({ default: FIXTURE }));

describe("sitemap", () => {
  it("lists every public static route as an absolute URL on SITE_URL", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual(
      expect.arrayContaining([
        `${SITE_URL}/`,
        `${SITE_URL}/news/list`,
        `${SITE_URL}/sousaku-list`,
        `${SITE_URL}/lottery-external`,
        `${SITE_URL}/requests`,
        `${SITE_URL}/changelog`,
      ]),
    );
  });

  it("omits the login-gated routes", () => {
    const urls = sitemap().map((entry) => entry.url);

    ["/login", "/chat", "/seat", "/seat/edit", "/lottery"].forEach((route) => {
      expect(urls).not.toContain(`${SITE_URL}${route}`);
    });
  });

  it("includes an unrestricted post with its date as lastModified", () => {
    const entry = sitemap().find(
      (item) => item.url === `${SITE_URL}/news/public-post`,
    );

    expect(entry).toBeDefined();
    expect(entry?.lastModified).toEqual(new Date("2026-02-01T09:00:00.000Z"));
  });

  it("omits internal and role-restricted posts", () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).not.toContain(`${SITE_URL}/news/internal-post`);
    expect(urls).not.toContain(`${SITE_URL}/news/role-restricted-post`);
  });

  it("emits only absolute https URLs", () => {
    sitemap().forEach((entry) => {
      expect(entry.url.startsWith(`${SITE_URL}/`)).toBe(true);
    });
  });
});
