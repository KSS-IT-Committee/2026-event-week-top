import type { ReactElement } from "react";

import { SCHOOL_NAME, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * 1200×630 — the 1.91:1 box every Open Graph consumer crops its preview to.
 * Each route spreads this into both its `size` metadata export and the
 * ImageResponse options, so the og:image:width/height tags can never claim a
 * size the pixels don't have.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export const OG_CONTENT_TYPE = "image/png";

/** Longest headline that still fits the card; anything longer is elided. */
const TITLE_MAX_LENGTH = 48;

/**
 * Headlines this short get the display size. The cut-off is roughly what fits
 * on one 92px line of full-width Japanese, so a short title never wraps.
 */
const TITLE_LARGE_MAX_LENGTH = 11;

// The site's accent blue (the footer gradient and every primary button) and
// the ink it sits on, repeated here because satori renders this card without
// ever seeing a stylesheet.
const ACCENT = "#0b69eb";
const INK = "#0f1a2b";
const MUTED = "#4a5568";

/** The bare host, e.g. "2026.kss-it.com", for the card's footer. */
const SITE_HOST = new URL(SITE_URL).host;

/**
 * A headline trimmed to what the card can show. Counting is by code point so
 * the cut never splits a surrogate pair — same rule as postExcerpt().
 */
export function clampOgTitle(title: string): string {
  const characters = [...title];
  if (characters.length <= TITLE_MAX_LENGTH) {
    return title;
  }
  return `${characters.slice(0, TITLE_MAX_LENGTH).join("")}…`;
}

type OgCardProps = {
  /** Small accent line above the headline: what kind of page this is. */
  eyebrow: string;
  /** The headline itself — the site name, or an article's title. */
  title: string;
};

/**
 * The social card both opengraph-image routes render, so the site-wide card
 * and a news article's card stay one design.
 *
 * Every element carries an explicit `display: flex`: satori (what ImageResponse
 * draws with) has no block layout, and a div with more than one child and no
 * display throws at render time rather than at build time.
 */
export function OgCard({ eyebrow, title }: OgCardProps): ReactElement {
  const headline = clampOgTitle(title);
  const isLargeHeadline = [...headline].length <= TITLE_LARGE_MAX_LENGTH;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "76px 88px",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 132,
          height: 14,
          borderRadius: 999,
          background: ACCENT,
        }}
      />

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 36, color: ACCENT }}>
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: isLargeHeadline ? 92 : 62,
            lineHeight: 1.3,
            color: INK,
          }}
        >
          {headline}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 28,
          color: MUTED,
        }}
      >
        <div style={{ display: "flex" }}>{`${SITE_NAME}・${SCHOOL_NAME}`}</div>
        <div style={{ display: "flex" }}>{SITE_HOST}</div>
      </div>
    </div>
  );
}
