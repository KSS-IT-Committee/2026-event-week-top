import { describe, expect, it, vi } from "vitest";

import newsImage, {
  alt as newsAlt,
  contentType as newsContentType,
  dynamicParams,
  generateStaticParams,
  size as newsSize,
} from "@/app/news/[id]/opengraph-image";
import siteImage, {
  alt as siteAlt,
  contentType as siteContentType,
  size as siteSize,
} from "@/app/opengraph-image";
import { SITE_NAME } from "@/lib/site";

const FIXTURE = vi.hoisted(() => [
  {
    slug: "public-post",
    id: "public-post",
    title: "計画メンテナンスのお知らせ",
    date: "2026-02-01T09:00:00.000Z",
    tag: "info",
    internal: false,
    roles: [] as string[],
    content: "",
    contentHtml: "",
  },
  {
    slug: "internal-post",
    id: "internal-post",
    title: "校内限定のお知らせ",
    date: "2026-01-15T12:30:00.000Z",
    tag: "info",
    internal: true,
    roles: [] as string[],
    content: "",
    contentHtml: "",
  },
]);

vi.mock("@/lib/posts.generated.json", () => ({ default: FIXTURE }));
vi.mock("./posts.generated.json", () => ({ default: FIXTURE }));

// Stand in for the real renderer: satori downloads a font for the Japanese
// glyphs, which would make these tests hit the network. Keeping the element
// instead of the pixels is also what lets us assert what the card says.
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(
      public element: { props: { eyebrow: string; title: string } },
      public options: { width: number; height: number },
    ) {}
  },
}));

type RenderedCard = {
  element: { props: { eyebrow: string; title: string } };
  options: { width: number; height: number };
};

async function renderArticleCard(id: string): Promise<RenderedCard> {
  const image = await newsImage({ params: Promise.resolve({ id }) });
  return image as unknown as RenderedCard;
}

describe("opengraph-image (site)", () => {
  it("declares the 1.91:1 card size social previews crop to", () => {
    expect(siteSize).toEqual({ width: 1200, height: 630 });
    expect(siteContentType).toBe("image/png");
  });

  it("names the site and the school in its alt text", () => {
    expect(siteAlt).toContain(SITE_NAME);
    expect(siteAlt).toContain("東京都立小石川中等教育学校");
  });

  it("renders the site name at the declared size", () => {
    const card = siteImage() as unknown as RenderedCard;

    expect(card.element.props.title).toBe(SITE_NAME);
    expect(card.options).toMatchObject(siteSize);
  });
});

describe("opengraph-image (news article)", () => {
  it("declares the same size and type as the site card", () => {
    expect(newsSize).toEqual(siteSize);
    expect(newsContentType).toBe(siteContentType);
    expect(newsAlt).toBe(siteAlt);
  });

  it("builds a card for every post, so no article 404s on its image", async () => {
    // dynamicParams === false, so an id missing from this list answers 404
    // rather than blowing up inside getPostById.
    expect(dynamicParams).toBe(false);
    expect(await generateStaticParams()).toEqual([
      { id: "public-post" },
      { id: "internal-post" },
    ]);
  });

  it("renders a public post's own title", async () => {
    const card = await renderArticleCard("public-post");

    expect(card.element.props.title).toBe("計画メンテナンスのお知らせ");
    expect(card.element.props.eyebrow).toBe("お知らせ");
  });

  it("never renders a restricted post's title", async () => {
    // The image is public — a crawler fetches it with no session — so it must
    // withhold exactly what the page's 401/403 withholds.
    const card = await renderArticleCard("internal-post");

    expect(card.element.props.title).toBe(SITE_NAME);
    expect(card.element.props.title).not.toContain("校内限定");
  });
});
