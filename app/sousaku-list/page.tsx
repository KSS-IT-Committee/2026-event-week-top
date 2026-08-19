import { readFile } from "node:fs/promises";
import path from "node:path";

import { Metadata } from "next";
import Link from "next/link";

import styles from "@/app/sousaku-list/sousaku-list.module.css";
import { parseMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "創作部門 | 劇内容紹介",
  description: "創作部門の各クラスの劇の内容紹介ページ",
};

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
