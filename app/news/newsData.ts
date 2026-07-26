import { canViewPost, type PostViewer } from "@/lib/post-access";
import posts from "@/lib/posts.generated.json";

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  tag: string;
  content: string;
}

/**
 * The news visible to `viewer` (the logged-in user's session, or null for
 * anonymous visitors), newest first. Posts restricted via visibility
 * frontmatter (see lib/post-access.ts) are filtered out here, so every
 * consumer — pages and the chat's get_recent_news tool — states its viewer
 * and can never accidentally surface an internal post.
 */
export function getNews(viewer: PostViewer): NewsItem[] {
  const news = posts
    .filter((post) => canViewPost(viewer, post))
    .map(
      (post) =>
        ({
          id: post.id,
          title: post.title,
          date: post.date.split("T")[0],
          tag: post.tag,
          content: post.content,
        }) satisfies NewsItem,
    );

  return news.sort((a, b) => (a.date < b.date ? 1 : -1));
}
