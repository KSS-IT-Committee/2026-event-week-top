import Link from "next/link";

import { getAllPosts, getPostById } from "@/lib/posts";

import "../markdown.css";

type Post = {
  id: string;
  contentHtml: string;
  title: string;
  date: string;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((p) => ({ id: p.id }));
}

export default async function NewsArticle(props: {
  params: { id: string };
}) {
  const { id } = props.params;

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
