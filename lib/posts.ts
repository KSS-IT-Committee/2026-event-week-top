import fs from "fs";
import matter from "gray-matter";
import path from "path";
import { remark } from "remark";
import html from "remark-html";

type Post = {
  id: string;
  contentHtml: string;
  title: string;
  date: string;
};

const postsDirectory = path.join(process.cwd(), "content/posts");

export function getAllPosts() {
  const fileNames = fs.readdirSync(postsDirectory);

  return fileNames.map((fileName) => {
    const id = fileName.replace(/\.md$/, "");
    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");

    const { data } = matter(fileContents);

    return {
      id,
      ...data,
    };
  });
}
export async function getPostById(id: string): Promise<Post> {
  const fullPath = path.join(postsDirectory, `${id}.md`);
  const fileContents = fs.readFileSync(fullPath, "utf8");

  const { data, content } = matter(fileContents);

  if (!data.title || !data.date) {
    throw new Error(`Post ${id} missing required frontmatter: title or date`);
  }

  const processedContent = await remark().use(html).process(content);
  const contentHtml = processedContent.toString();

  return {
    id,
    contentHtml,
    title: data.title,
    date: data.date,
  };
}
