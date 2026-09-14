import type { MetadataRoute } from "next";

import { getPublicPosts } from "@/lib/posts";
import { SITE_URL } from "@/lib/site";

/**
 * Every route a logged-out visitor can actually read. The login-gated routes
 * are deliberately absent — listing a URL that answers 401 asks Google to
 * crawl something it can never index.
 */
const PUBLIC_ROUTES = [
  "/",
  "/news/list",
  "/sousaku-list",
  "/lottery-external",
  "/requests",
  "/changelog",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries = PUBLIC_ROUTES.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
  }));

  // Only unrestricted posts: an internal post's URL in a public sitemap would
  // advertise its existence to anyone who fetches /sitemap.xml.
  const postEntries = getPublicPosts().map((post) => ({
    url: new URL(`/news/${post.id}`, SITE_URL).toString(),
    lastModified: new Date(post.date),
  }));

  return [...staticEntries, ...postEntries];
}
