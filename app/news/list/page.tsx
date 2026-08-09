import { Metadata } from "next";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import styles from "@/app/news/list/news-page.module.css";
import { getNews } from "@/app/news/newsData";
import { NewsItem } from "@/app/news/newsItem";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "News List",
  description: "2026年度行事週間 ニュース一覧ページ",
};

// The list is filtered per viewer (getNews needs the session), so this page
// renders dynamically — it can no longer be force-static.
export default async function NewsListPage() {
  const user = await getCurrentUser();
  const sorted = getNews(user);

  return (
    <div className={styles.newsContainer}>
      <div className={styles.header}>
        <h1 className={styles.newsTitle}>ニュース一覧</h1>
        <p className={styles.newsIntro}>最新のニュースをお届けします。</p>
      </div>
      <div className={styles.newsContent}>
        <h1 className={styles.newsInfo}>《News》</h1>
        <p className={styles.information}>
          お知らせをクリックすると詳細が表示されます。
        </p>
        <ul className={styles.newsList}>
          {sorted.map((item) => (
            <NewsItem key={item.id} item={item} />
          ))}
        </ul>
      </div>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </div>
  );
}
