/**
 * When each festival of 行事週間2026 begins, in JST.
 *
 * One source for two readers: the <Countdown> the top page renders, and the
 * Event structured data it emits next to it (lib/structured-data.ts). The
 * dates used to be literals typed into the Countdown props, which is exactly
 * how a countdown ends up pointing at a different day than the schedule a
 * search engine reads.
 */
export type Festival = {
  /** The heading the top page gives this event. */
  name: string;
  /** The top page's anchor for it, which is also its JSON-LD `@id` fragment. */
  anchor: string;
  /** Start of the event: ISO 8601 with the JST offset, as <Countdown> wants. */
  startsAt: string;
  /** The festival's own site, if it has one; otherwise its top-page section. */
  siteUrl?: string;
};

export const FESTIVALS = {
  geinousai: {
    name: "芸能祭",
    anchor: "performance",
    startsAt: "2026-09-07T00:00:00+09:00",
  },
  taiikusai: {
    name: "体育祭",
    anchor: "sports",
    startsAt: "2026-09-09T00:00:00+09:00",
    siteUrl: "https://taiikusai.2026.kss-it.com",
  },
  sousakuten: {
    name: "創作展",
    anchor: "create",
    startsAt: "2026-09-12T00:00:00+09:00",
    siteUrl: "https://sousakuten-top.2026.kss-it.com",
  },
  kouyasai: {
    name: "後夜祭",
    anchor: "ceremony",
    startsAt: "2026-09-14T00:00:00+09:00",
  },
} as const satisfies Record<string, Festival>;

/** The four festivals, in the order the top page lists them. */
export const FESTIVAL_LIST: readonly Festival[] = Object.values(FESTIVALS);

/** Start of the event week itself — the countdown above the four festivals. */
export const EVENT_WEEK_STARTS_AT = "2026-09-06T00:00:00+09:00";
