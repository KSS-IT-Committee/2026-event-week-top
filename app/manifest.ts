import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME, THEME_COLOR } from "@/lib/site";

/**
 * Web app manifest, served at /manifest.webmanifest (Next appends the
 * <link rel="manifest"> itself — the file convention is the whole wiring).
 *
 * Name, description and colours come from lib/site.ts so the install prompt,
 * the <title> suffix and the browser UI colour can never drift apart.
 * `short_name` repeats `name` on purpose: SITE_NAME is already inside the
 * ~12-character budget a launcher label has, so there is nothing to shorten.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "ja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Matches --background in app/globals.css: the splash screen behind the
    // icon should be the page background, not the accent.
    background_color: "#ffffff",
    theme_color: THEME_COLOR,
    icons: [
      // The same file the <link rel="icon"> points at (app/icon.png is served
      // at /icon.png), so an install reuses an icon the browser already has.
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops a maskable icon to its own shape, so this one keeps the
      // crest inside the 80% safe zone. That padding makes it a poor tab
      // icon, which is why it lives in public/ instead of being a second
      // app/icon file — it must never end up in <link rel="icon">.
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
