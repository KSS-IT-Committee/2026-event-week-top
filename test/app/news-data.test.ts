import { describe, expect, it, vi } from "vitest";

import { getNews } from "@/app/news/newsData";

const FIXTURE = vi.hoisted(() => [
  {
    slug: "post-feb",
    id: "post-feb",
    title: "February Post",
    date: "2026-02-01T09:00:00.000Z",
    tag: "sport",
    content: "Feb content",
    contentHtml: "<p>Feb content</p>",
  },
  {
    slug: "post-jan",
    id: "post-jan",
    title: "January Post",
    date: "2026-01-15T12:30:00.000Z",
    tag: "info",
    content: "",
    contentHtml: "",
  },
  {
    slug: "post-mar",
    id: "post-mar",
    title: "March Post",
    date: "2026-03-20T18:45:00.000Z",
    tag: "art",
    content: "March content",
    contentHtml: "<p>March content</p>",
  },
]);

vi.mock("@/lib/posts.generated.json", () => ({ default: FIXTURE }));

describe("getNews", () => {
  it("maps each post to a NewsItem with a date-only date", () => {
    const news = getNews();

    expect(news).toContainEqual({
      id: "post-feb",
      title: "February Post",
      date: "2026-02-01",
      tag: "sport",
      content: "Feb content",
    });
  });

  it("sorts posts by date descending (newest first)", () => {
    const news = getNews();

    expect(news.map((item) => item.date)).toEqual([
      "2026-03-20",
      "2026-02-01",
      "2026-01-15",
    ]);
    expect(news.map((item) => item.id)).toEqual([
      "post-mar",
      "post-feb",
      "post-jan",
    ]);
  });

  it("strips the time component from every date", () => {
    const news = getNews();

    news.forEach((item) => {
      expect(item.date).not.toContain("T");
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("produces exactly the NewsItem fields for each item", () => {
    const news = getNews();

    news.forEach((item) => {
      expect(Object.keys(item).sort()).toEqual(
        ["content", "date", "id", "tag", "title"].sort(),
      );
    });
  });

  it("preserves empty content for posts with no body", () => {
    const news = getNews();
    const jan = news.find((item) => item.id === "post-jan");

    expect(jan?.content).toBe("");
  });

  it("returns one NewsItem per source post", () => {
    const news = getNews();

    expect(news).toHaveLength(FIXTURE.length);
  });
});
