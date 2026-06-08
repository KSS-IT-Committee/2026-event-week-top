import Link from "next/link";

import { getAllPosts, getPostById } from "@/lib/posts";

import styles from "../markdown.module.css";

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
        <div
          className={styles.markdown}
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
      <Link href="/" className={styles.backButton}>
        トップに戻る
      </Link>
    </>
  );
}
