import { describe, expect, it } from "vitest";

import { pageMetadata, SITE_NAME, SITE_URL } from "@/lib/site";

describe("pageMetadata (indexable)", () => {
  const meta = pageMetadata({
    title: "ニュース一覧",
    description: "お知らせ一覧。",
    path: "/news/list",
  });

  it("returns the bare title so the layout's title.template can suffix it", () => {
    expect(meta.title).toBe("ニュース一覧");
  });

  it("sets the canonical to the page's own path", () => {
    expect(meta.alternates?.canonical).toBe("/news/list");
  });

  it("carries og:site_name, locale and the image on every page", () => {
    // These live here rather than in the root layout because Next replaces a
    // nested metadata object wholesale instead of merging it.
    expect(meta.openGraph).toMatchObject({
      siteName: SITE_NAME,
      locale: "ja_JP",
      type: "website",
      url: "/news/list",
    });
    expect(meta.openGraph?.images).toHaveLength(1);
  });

  it("emits a summary_large_image Twitter card", () => {
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "ニュース一覧",
      description: "お知らせ一覧。",
    });
  });

  it("leaves robots unset so the page stays indexable", () => {
    expect(meta.robots).toBeUndefined();
  });

  it("marks the title absolute only when asked", () => {
    const top = pageMetadata({
      title: SITE_NAME,
      isTitleAbsolute: true,
      description: "トップ",
      path: "/",
    });

    expect(top.title).toEqual({ absolute: SITE_NAME });
  });

  it("switches og:type to article and adds publishedTime for a post", () => {
    const article = pageMetadata({
      title: "記事",
      description: "本文",
      path: "/news/news1",
      publishedTime: "2026-05-24T00:00:00.000Z",
    });

    expect(article.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-05-24T00:00:00.000Z",
    });
  });
});

describe("pageMetadata (non-indexable)", () => {
  const meta = pageMetadata({
    title: "ログイン",
    description: "ログインページ",
    isIndexable: false,
  });

  it("marks the page noindex, nofollow", () => {
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("claims no canonical URL and no social card", () => {
    expect(meta.alternates).toBeUndefined();
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });

  it("still sets a title and description", () => {
    expect(meta.title).toBe("ログイン");
    expect(meta.description).toBe("ログインページ");
  });
});

describe("SITE_URL", () => {
  it("is the primary production origin, with no trailing slash", () => {
    expect(SITE_URL).toBe("https://2026.kss-it.com");
  });
});
