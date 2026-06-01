import "../markdown.css";

import Link from "next/link";

import { getPostById } from "@/lib/posts";

type Post = {
  id: string;
  contentHtml: string;
  title: string;
  date: string;
};

export default async function NewsArticle(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const post: Post = await getPostById(id);

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
