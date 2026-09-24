import { FESTIVAL_LIST } from "@/lib/events";
import { postExcerpt } from "@/lib/post-excerpt";
import { SCHOOL_NAME, SITE_URL } from "@/lib/site";

/** One schema.org node. Nodes are plain data — the page serializes them. */
export type JsonLd = Record<string, unknown>;

/**
 * Stable identities, so nodes emitted by different pages (and different
 * <script> blocks on one page) are understood as the same two organizations
 * rather than a new pair per URL.
 */
const SCHOOL_ID = `${SITE_URL}/#school`;
const COMMITTEE_ID = `${SITE_URL}/#committee`;

/** The committees that run the event week, as the site's footer credits them. */
const COMMITTEE_NAME = "行事運営委員会・IT委員会";

function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * The school and the committees behind the site.
 *
 * Every page that emits structured data includes these, so a `publisher` or
 * `organizer` reference never dangles. Deliberately no postal address or phone
 * number: the repo has no canonical source for the school's, and structured
 * data a search engine trusts is worse wrong than absent.
 */
export function organizationNodes(): JsonLd[] {
  return [
    {
      "@type": "EducationalOrganization",
      "@id": SCHOOL_ID,
      name: SCHOOL_NAME,
      subOrganization: { "@id": COMMITTEE_ID },
    },
    {
      "@type": "Organization",
      "@id": COMMITTEE_ID,
      name: COMMITTEE_NAME,
      parentOrganization: { "@id": SCHOOL_ID },
      url: SITE_URL,
    },
  ];
}

/**
 * The four festivals, as Event nodes for the top page.
 *
 * `startDate` is the calendar day taken from the same constant the countdown
 * counts down to — the constant stores the JST midnight <Countdown> needs, and
 * an event that "starts at 00:00" would be a claim the site never makes.
 */
export function festivalEventNodes(): JsonLd[] {
  return FESTIVAL_LIST.map((festival) => {
    // The `@id` stays on the top-page section so the identity is stable; the
    // `url` points visitors at the festival's own site where one exists.
    const id = absoluteUrl(`/#${festival.anchor}`);

    return {
      "@type": "Event",
      "@id": id,
      name: festival.name,
      // "2026-09-07T00:00:00+09:00" -> "2026-09-07"
      startDate: festival.startsAt.slice(0, 10),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: SCHOOL_NAME },
      organizer: { "@id": COMMITTEE_ID },
      url: festival.siteUrl ?? id,
    };
  });
}

type Article = {
  id: string;
  title: string;
  date: string;
  contentHtml: string;
};

/**
 * One news article. Only ever emitted for a post the viewer is allowed to see
 * — the page answers 401/403 before it renders — so this can carry the real
 * headline where the page's own metadata cannot.
 */
export function newsArticleNode(article: Article): JsonLd {
  const url = absoluteUrl(`/news/${article.id}`);

  return {
    "@type": "NewsArticle",
    "@id": url,
    headline: article.title,
    description: postExcerpt(article.contentHtml),
    datePublished: article.date,
    inLanguage: "ja",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@id": COMMITTEE_ID },
    publisher: { "@id": COMMITTEE_ID },
    url,
  };
}

export type Crumb = {
  name: string;
  /** Root-relative path; resolved against SITE_URL, never the request host. */
  path: string;
};

/** The trail from the top page down to the current one. */
export function breadcrumbNode(trail: Crumb[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * The page's nodes as one `@graph`, ready for a <script type="application/ld+json">.
 *
 * `<` becomes its unicode escape because JSON.stringify does not sanitize:
 * without it a post title containing `</script>` would close the tag early and
 * the rest would be parsed as markup. The escape is invisible to a JSON reader.
 */
export function serializeJsonLd(graph: JsonLd[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");
}
