import type { Metadata } from "next";

/**
 * Canonical origin for this app. The site answers on two production hostnames
 * (2026.kss-it.com and top.2026.kss-it.com) and again on every PR-preview
 * subdomain, so canonical and Open Graph URLs are pinned to the primary host
 * rather than derived from the request — that is what stops the alias and the
 * previews from competing with production as duplicate content.
 */
export const SITE_URL = "https://2026.kss-it.com";

/** Short site name: the `%s | …` title suffix and og:site_name. */
export const SITE_NAME = "行事週間2026";

export const SITE_DESCRIPTION =
  "東京都立小石川中等教育学校の行事週間2026 公式サイト。創作展・体育祭・芸能祭の日程、最新ニュース、公演観覧抽選のご案内。";

/**
 * Shared Open Graph image. Not a purpose-built 1200×630 card yet — this is the
 * site's existing key visual, whose 1849×878 is close enough to the 1.91:1 that
 * Open Graph wants.
 */
const OG_IMAGE = {
  url: "/theme.png",
  width: 1849,
  height: 878,
  alt: SITE_NAME,
};

type IndexablePage = {
  /** Page title WITHOUT the site suffix — `title.template` appends it. */
  title: string;
  /**
   * Set on the top page only, where the title already carries the site name
   * and `title.template` would otherwise repeat it.
   */
  isTitleAbsolute?: boolean;
  description: string;
  /** Root-relative path; `metadataBase` resolves it against SITE_URL. */
  path: string;
  /** Set for news articles: emits og:type=article + article:published_time. */
  publishedTime?: string;
  isIndexable?: true;
};

type NonIndexablePage = {
  title: string;
  description: string;
  isIndexable: false;
};

type PageMetadataOptions = IndexablePage | NonIndexablePage;

/**
 * Title, description, canonical URL and social cards for one page.
 *
 * Every page builds its metadata through this rather than inheriting from the
 * root layout, because Next merges metadata objects only **shallowly**: a page
 * that sets any `openGraph` field replaces the layout's entire `openGraph`
 * object, silently dropping og:site_name, og:locale and the image. The same
 * applies to `twitter` and `alternates`.
 *
 * `isIndexable: false` is for the login-gated and error routes. They get no
 * canonical and no social card — a page a crawler can only ever see as a 401
 * has no canonical URL worth claiming — and an explicit noindex on top of the
 * one Next already injects into its 401/403/404 fallbacks.
 */
export function pageMetadata(options: PageMetadataOptions): Metadata {
  const { title, description } = options;

  if (options.isIndexable === false) {
    return { title, description, robots: { index: false, follow: false } };
  }

  const { path, publishedTime, isTitleAbsolute = false } = options;
  const openGraph = {
    siteName: SITE_NAME,
    locale: "ja_JP",
    url: path,
    title,
    description,
    images: [OG_IMAGE],
  };

  return {
    title: isTitleAbsolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: publishedTime
      ? { ...openGraph, type: "article", publishedTime }
      : { ...openGraph, type: "website" },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
