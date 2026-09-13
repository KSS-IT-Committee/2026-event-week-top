import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * Crawl policy.
 *
 * The disallowed routes are the login-gated ones. They are not *protected* by
 * this — a crawler already gets a 401/403 from AuthGuard, and Next injects
 * <meta name="robots" content="noindex"> into those fallbacks — this only stops
 * the pointless crawl of pages that can never render for an anonymous visitor.
 *
 * `/lottery$` and `/lottery/` are listed separately on purpose: robots.txt
 * matches by prefix, so a bare `/lottery` would also swallow the public
 * `/lottery-external`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/chat", "/login", "/lottery$", "/lottery/", "/seat"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
