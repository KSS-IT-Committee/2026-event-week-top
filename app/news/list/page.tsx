export const dynamic = "force-static";

import Link from "next/link";

import styles from "@/app/news/list/news-page.module.css";
import { news } from "@/app/news/newsData";
import { NewsItem } from "@/app/news/newsItem";

export default function NewsListPage() {
  const sorted = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className={styles.newsContainer}>
      <div className={styles.header}>
        <h1 className={styles.newsTitle}>ニュース一覧</h1>
        <p className={styles.newsIntro}>最新のニュースをお届けします。</p>
      </div>
      <div className={styles.newsContent}>
        <h1 className={styles.newsInfo}>《News》</h1>
        <p className={styles.information}>
          お知らせをクイックすると詳細が表示されます。
        </p>
        <ul className={styles.newsList}>
          {sorted.map((item) => (
            <NewsItem key={item.id} item={item} />
          ))}
        </ul>
      </div>
      <Link href="/" className={styles.backButton}>
        トップに戻る
      </Link>
    </div>
  );
}
