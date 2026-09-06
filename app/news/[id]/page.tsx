import { Metadata } from "next";
import { forbidden, unauthorized } from "next/navigation";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import styles from "@/app/news/markdown.module.css";
import { canViewPost, isRestrictedPost } from "@/lib/post-access";
import { getAllPosts, getPostById } from "@/lib/posts";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "ニュース | 2026年度行事週間",
  description: "2026年度行事週間 ニュース詳細ページ",
};

export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ id: p.id }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPostById(id);

  // Only restricted posts consult the session, so public posts skip the
  // per-request session DB lookup. Same interrupt pair as AuthGuard: 401
  // sends anonymous visitors to log in, 403 tells a logged-in user they lack
  // the required role.
  if (isRestrictedPost(post)) {
    const user = await getCurrentUser();
    if (!canViewPost(user, post)) {
      if (user === null) {
        unauthorized();
      }
      forbidden();
    }
  }

  return (
    <>
      <article>
        <div className={styles.header}>
          <h1 className={styles.title}>{post.title}</h1>
          <p className={styles.date}>
            {new Date(post.date).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <div className={styles.wrapper}>
          <div
            className={styles.markdown}
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
        </div>
      </article>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </>
  );
}
