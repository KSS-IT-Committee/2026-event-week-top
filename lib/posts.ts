import type { PostVisibility } from "@/lib/post-access";

import posts from "./posts.generated.json";

type Post = PostVisibility & {
  id: string;
  contentHtml: string;
  title: string;
  date: string;
};

export function getAllPosts() {
  return posts.map((post) => ({
    id: post.slug,
    title: post.title,
    date: post.date,
    tag: post.tag,
  }));
}

export async function getPostById(id: string): Promise<Post> {
  const post = posts.find((p) => p.slug === id);

  if (!post) {
    throw new Error(`Post ${id} not found`);
  }

  return {
    id: post.slug,
    contentHtml: post.contentHtml,
    title: post.title,
    date: post.date,
    internal: post.internal,
    roles: post.roles,
  };
}
