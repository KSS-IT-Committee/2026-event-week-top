import { ImageResponse } from "next/og";

import { OG_CONTENT_TYPE, OG_SIZE, OgCard } from "@/lib/og-card";
import { isRestrictedPost } from "@/lib/post-access";
import { getAllPosts, getPostById } from "@/lib/posts";
import { SCHOOL_NAME, SITE_NAME } from "@/lib/site";

/** The eyebrow every article card carries, matching the page's own wording. */
const EYEBROW = "お知らせ";

export const alt = `${SITE_NAME} | ${SCHOOL_NAME}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Same pair as the page: only the ids that exist get a card, and anything else
// is a 404 rather than a 500 out of getPostById.
export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ id: post.id }));
}

/**
 * The card for one article.
 *
 * A restricted post falls back to the site name, for the same reason
 * generateMetadata does: this image is public — it has no session and a
 * crawler fetches it directly — so putting a members-only headline in it would
 * hand out exactly what the 401/403 on the page withholds.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostById(id);
  const isRestricted = isRestrictedPost(post);

  return new ImageResponse(
    <OgCard eyebrow={EYEBROW} title={isRestricted ? SITE_NAME : post.title} />,
    { ...size },
  );
}
