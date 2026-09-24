import { describe, expect, it } from "vitest";

import { clampOgTitle, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-card";

describe("OG_SIZE", () => {
  it("is the 1200×630 box Open Graph previews crop to", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
    expect(OG_CONTENT_TYPE).toBe("image/png");
  });
});

describe("clampOgTitle", () => {
  it("leaves a title that already fits alone", () => {
    expect(clampOgTitle("計画メンテナンスのお知らせ")).toBe(
      "計画メンテナンスのお知らせ",
    );
  });

  it("elides a title too long for the card", () => {
    const clamped = clampOgTitle("あ".repeat(60));

    expect(clamped).toBe(`${"あ".repeat(48)}…`);
  });

  it("keeps a title of exactly the maximum length intact", () => {
    const exact = "あ".repeat(48);

    expect(clampOgTitle(exact)).toBe(exact);
  });

  it("counts by code point, so it never splits a surrogate pair", () => {
    // Each emoji is two UTF-16 units; a naive slice(0, 48) would cut one in
    // half and leave an unpaired surrogate on the card.
    const clamped = clampOgTitle("🎉".repeat(60));

    expect([...clamped]).toHaveLength(49);
    expect(clamped.endsWith("…")).toBe(true);
    expect(clamped).not.toContain("�");
  });
});
