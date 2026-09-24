import { describe, expect, it } from "vitest";

import { FESTIVAL_LIST } from "@/lib/events";
import { SCHOOL_NAME, SITE_URL } from "@/lib/site";
import {
  breadcrumbNode,
  festivalEventNodes,
  newsArticleNode,
  organizationNodes,
  serializeJsonLd,
} from "@/lib/structured-data";

const COMMITTEE_ID = `${SITE_URL}/#committee`;

describe("organizationNodes", () => {
  const [school, committee] = organizationNodes();

  it("names the school the way the school spells it", () => {
    expect(school).toMatchObject({
      "@type": "EducationalOrganization",
      "@id": `${SITE_URL}/#school`,
      name: SCHOOL_NAME,
    });
  });

  it("links the committee to the school both ways", () => {
    expect(school.subOrganization).toEqual({ "@id": COMMITTEE_ID });
    expect(committee).toMatchObject({
      "@type": "Organization",
      "@id": COMMITTEE_ID,
      parentOrganization: { "@id": `${SITE_URL}/#school` },
      url: SITE_URL,
    });
  });

  it("claims no address it cannot source", () => {
    expect(school).not.toHaveProperty("address");
    expect(school).not.toHaveProperty("telephone");
  });
});

describe("festivalEventNodes", () => {
  const events = festivalEventNodes();

  it("describes every festival the top page counts down to", () => {
    expect(events.map((event) => event.name)).toEqual([
      "芸能祭",
      "体育祭",
      "創作展",
      "後夜祭",
    ]);
  });

  it("takes each date from the same constant as the countdown", () => {
    // The whole point of lib/events.ts: no literal typed twice, so the
    // structured data cannot name a different day than the countdown.
    expect(events.map((event) => event.startDate)).toEqual(
      FESTIVAL_LIST.map((festival) => festival.startsAt.slice(0, 10)),
    );
  });

  it("anchors each event's identity at its section of the top page", () => {
    expect(events.map((event) => event["@id"])).toEqual([
      `${SITE_URL}/#performance`,
      `${SITE_URL}/#sports`,
      `${SITE_URL}/#create`,
      `${SITE_URL}/#ceremony`,
    ]);
  });

  it("links to the festival's own site where one exists", () => {
    expect(events.map((event) => event.url)).toEqual([
      `${SITE_URL}/#performance`,
      "https://taiikusai.2026.kss-it.com",
      "https://sousakuten-top.2026.kss-it.com",
      `${SITE_URL}/#ceremony`,
    ]);
  });

  it("marks every event scheduled, in person, and run by the committee", () => {
    events.forEach((event) => {
      expect(event).toMatchObject({
        "@type": "Event",
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: SCHOOL_NAME },
        organizer: { "@id": COMMITTEE_ID },
      });
    });
  });
});

describe("newsArticleNode", () => {
  const article = newsArticleNode({
    id: "news6",
    title: "計画メンテナンスのお知らせ",
    date: "2026-02-01T09:00:00.000Z",
    contentHtml: "<p>詳しくは <a href='/x'>こちら</a> をご覧ください。</p>",
  });

  it("carries the headline, publish date and canonical URL", () => {
    expect(article).toMatchObject({
      "@type": "NewsArticle",
      headline: "計画メンテナンスのお知らせ",
      datePublished: "2026-02-01T09:00:00.000Z",
      url: `${SITE_URL}/news/news6`,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${SITE_URL}/news/news6`,
      },
    });
  });

  it("summarises the body as plain text, markup stripped", () => {
    expect(article.description).toBe("詳しくは こちら をご覧ください。");
  });

  it("credits the committee as author and publisher", () => {
    expect(article.author).toEqual({ "@id": COMMITTEE_ID });
    expect(article.publisher).toEqual({ "@id": COMMITTEE_ID });
  });
});

describe("breadcrumbNode", () => {
  const crumbs = breadcrumbNode([
    { name: "行事週間2026", path: "/" },
    { name: "ニュース一覧", path: "/news/list" },
    { name: "お知らせ", path: "/news/news6" },
  ]);

  it("numbers the trail from one and resolves every item absolutely", () => {
    expect(crumbs.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "行事週間2026",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "ニュース一覧",
        item: `${SITE_URL}/news/list`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "お知らせ",
        item: `${SITE_URL}/news/news6`,
      },
    ]);
  });
});

describe("serializeJsonLd", () => {
  it("wraps the nodes in one schema.org @graph", () => {
    const parsed = JSON.parse(serializeJsonLd(organizationNodes()));

    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@graph"]).toHaveLength(2);
  });

  it("escapes < so a title can never close the script tag", () => {
    const serialized = serializeJsonLd([
      { "@type": "NewsArticle", headline: "</script><img onerror=alert(1)>" },
    ]);

    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script");
    // Still valid JSON: \u003c is just an escaped character to a JSON reader.
    expect(JSON.parse(serialized)["@graph"][0].headline).toBe(
      "</script><img onerror=alert(1)>",
    );
  });
});
