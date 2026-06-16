import { Metadata } from "next";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import styles from "@/app/news/markdown.module.css";
import { getAllPosts, getPostById } from "@/lib/posts";

export const metadata: Metadata = {
  title: "News",
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
