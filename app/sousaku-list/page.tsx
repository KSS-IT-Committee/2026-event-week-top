import { readFile } from "node:fs/promises";
import path from "node:path";

import Link from "next/link";

import { parseMarkdown } from "@/lib/markdown";

import styles from "@/app/sousaku-list/sousaku-list.module.css";

export default async function SousakuListPage() {
  const content = await readFile(
    path.join(process.cwd(), "app/sousaku-list/content.md"),
    "utf8",
  );
  const contentHtml = await parseMarkdown(content);

  return (
    <main className={styles.content}>
      <Link className={styles.link} href="/lottery">
        ← 戻る
      </Link>
      <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </main>
  );
}
