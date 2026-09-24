import { describe, expect, it } from "vitest";

import { EVENT_WEEK_STARTS_AT, FESTIVAL_LIST, FESTIVALS } from "@/lib/events";

describe("FESTIVALS", () => {
  it("lists the four festivals in the order the top page shows them", () => {
    expect(FESTIVAL_LIST.map((festival) => festival.name)).toEqual([
      "芸能祭",
      "体育祭",
      "創作展",
      "後夜祭",
    ]);
  });

  it("gives every start an explicit JST offset", () => {
    // <Countdown> parses these with `new Date(...)` in the visitor's browser.
    // Without the offset the countdown would end at local midnight wherever
    // the visitor happens to be.
    [EVENT_WEEK_STARTS_AT, ...FESTIVAL_LIST.map((f) => f.startsAt)].forEach(
      (startsAt) => {
        expect(startsAt.endsWith("+09:00")).toBe(true);
        expect(Number.isNaN(Date.parse(startsAt))).toBe(false);
      },
    );
  });

  it("starts the week before the first festival, in chronological order", () => {
    const times = FESTIVAL_LIST.map((festival) =>
      Date.parse(festival.startsAt),
    );

    expect(Date.parse(EVENT_WEEK_STARTS_AT)).toBeLessThan(times[0]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("anchors each festival at a distinct section of the top page", () => {
    const anchors = FESTIVAL_LIST.map((festival) => festival.anchor);

    expect(anchors).toEqual(["performance", "sports", "create", "ceremony"]);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("keeps the keyed lookup and the ordered list in sync", () => {
    expect(Object.values(FESTIVALS)).toEqual(FESTIVAL_LIST);
  });
});
