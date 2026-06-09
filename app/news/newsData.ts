import fs from "fs";
import matter from "gray-matter";
import path from "path";

export interface NewsItem {
  id: string;
  title: string;
  date: string;
  tag: string;
  content: string;
}

export function getNews(): NewsItem[] {
  const newsDir = path.join(process.cwd(), "content/posts");
  const files = fs.readdirSync(newsDir);

  const news = files.map((file) => {
    const filePath = path.join(newsDir, file);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(fileContent);

    return {
      id: data.id,
      title: data.title,
      date: new Date(data.date).toISOString().split("T")[0],
      tag: data.tag,
      content,
    } satisfies NewsItem;
  });

  return news.sort((a, b) => (a.date < b.date ? 1 : -1));
}
