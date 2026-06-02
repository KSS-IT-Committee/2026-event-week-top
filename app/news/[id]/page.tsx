import "../markdown.css";

import Link from "next/link";

import { getAllPosts, getPostById } from "@/lib/posts";

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
        <div className="header">
          <h1 className="title">{post.title}</h1>
          <p className="date">
            {new Date(post.date).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <div
          className="markdown"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
      <Link href="/" className="backButton">
        トップに戻る
      </Link>
    </>
  );
}
