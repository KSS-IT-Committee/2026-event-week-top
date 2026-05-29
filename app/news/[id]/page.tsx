import { getPostById } from "@/lib/posts";
import Link from "next/link";
import "../markdown.css";

export default async function NewsArticle(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;   

  const post = await getPostById(id);

  return (
    <><article>
      <div className="header">
        <h1 className="title">{post.title}</h1>
        <p className="date">{post.date.toLocaleDateString("ja-JP")}</p>
      </div>
      <div className="markdown" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
    </article>
      <Link href="/" className="backButton">
        トップに戻る
      </Link></>
  );
}


