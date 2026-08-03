import { remark } from "remark";
import gfm from "remark-gfm";
import html from "remark-html";

export async function parseMarkdown(markdown: string): Promise<string> {
  const processed = await remark().use(gfm).use(html).process(markdown);
  return String(processed);
}
