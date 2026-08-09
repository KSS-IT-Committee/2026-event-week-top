import { describe, expect, it, vi } from "vitest";

import { getNews } from "@/app/news/newsData";

const FIXTURE = vi.hoisted(() => [
  {
    slug: "post-feb",
    id: "post-feb",
    title: "February Post",
    date: "2026-02-01T09:00:00.000Z",
    tag: "sport",
    internal: false,
    roles: [] as string[],
    content: "Feb content",
    contentHtml: "<p>Feb content</p>",
  },
  {
    slug: "post-jan",
    id: "post-jan",
    title: "January Post",
    date: "2026-01-15T12:30:00.000Z",
    tag: "info",
    internal: false,
    roles: [] as string[],
    content: "",
    contentHtml: "",
  },
  {
    slug: "post-mar",
    id: "post-mar",
    title: "March Post",
    date: "2026-03-20T18:45:00.000Z",
    tag: "art",
    internal: false,
    roles: [] as string[],
    content: "March content",
    contentHtml: "<p>March content</p>",
  },
  {
    slug: "post-internal",
    id: "post-internal",
    title: "Internal Post",
    date: "2026-04-01T00:00:00.000Z",
    tag: "info",
    internal: true,
    roles: [] as string[],
    content: "Members only",
    contentHtml: "<p>Members only</p>",
  },
  {
    slug: "post-it-only",
    id: "post-it-only",
    title: "IT Committee Post",
    date: "2026-04-02T00:00:00.000Z",
    tag: "itcommittee",
    internal: false,
    roles: ["IT"] as string[],
    content: "Committee only",
    contentHtml: "<p>Committee only</p>",
  },
]);

const PUBLIC_IDS = ["post-mar", "post-feb", "post-jan"];

vi.mock("@/lib/posts.generated.json", () => ({ default: FIXTURE }));

describe("getNews", () => {
  it("maps each post to a NewsItem with a date-only date", () => {
    const news = getNews(null);

    expect(news).toContainEqual({
      id: "post-feb",
      title: "February Post",
      date: "2026-02-01",
      tag: "sport",
      content: "Feb content",
    });
  });

  it("sorts posts by date descending (newest first)", () => {
    const news = getNews(null);

    expect(news.map((item) => item.date)).toEqual([
      "2026-03-20",
      "2026-02-01",
      "2026-01-15",
    ]);
    expect(news.map((item) => item.id)).toEqual(PUBLIC_IDS);
  });

  it("strips the time component from every date", () => {
    const news = getNews(null);

    news.forEach((item) => {
      expect(item.date).not.toContain("T");
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("produces exactly the NewsItem fields for each item", () => {
    const news = getNews(null);

    news.forEach((item) => {
      expect(Object.keys(item).sort()).toEqual(
        ["content", "date", "id", "tag", "title"].sort(),
      );
    });
  });

  it("preserves empty content for posts with no body", () => {
    const news = getNews(null);
    const jan = news.find((item) => item.id === "post-jan");

    expect(jan?.content).toBe("");
  });
});

describe("getNews — visibility filtering", () => {
  it("shows only public posts to an anonymous viewer", () => {
    const news = getNews(null);

    expect(news.map((item) => item.id)).toEqual(PUBLIC_IDS);
  });

  it("hides restricted posts from a logged-in viewer without roles", () => {
    const news = getNews({ roles: [] });

    expect(news.map((item) => item.id)).toEqual(PUBLIC_IDS);
  });

  it("shows internal posts to a viewer holding an internal role", () => {
    const news = getNews({ roles: ["Students"] });

    expect(news.map((item) => item.id)).toEqual([
      "post-internal",
      ...PUBLIC_IDS,
    ]);
  });

  it("shows role-restricted posts only to holders of a listed role", () => {
    const news = getNews({ roles: ["IT", "Teachers"] });

    expect(news.map((item) => item.id)).toEqual([
      "post-it-only",
      "post-internal",
      ...PUBLIC_IDS,
    ]);
  });

  it("returns every post to a viewer allowed to see them all", () => {
    const news = getNews({ roles: ["Students", "IT"] });

    expect(news).toHaveLength(FIXTURE.length);
  });
});
