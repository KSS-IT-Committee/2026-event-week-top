import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgCard } from "@/lib/og-card";
import { SCHOOL_NAME, SITE_NAME } from "@/lib/site";

/**
 * The site-wide social card. Living in the root segment makes it the og:image
 * for every route that does not bring its own opengraph-image file — see
 * app/news/[id]/opengraph-image.tsx for the one that does.
 *
 * Nothing here reads the request, so Next prerenders the PNG at build time:
 * the font satori fetches for the Japanese glyphs is downloaded once during
 * `npm run build`, not on every crawler hit.
 */
export const alt = `${SITE_NAME} | ${SCHOOL_NAME}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return new ImageResponse(<OgCard eyebrow="公式サイト" title={SITE_NAME} />, {
    ...size,
  });
}
