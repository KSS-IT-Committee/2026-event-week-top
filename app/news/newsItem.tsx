import Link from "next/link";

import styles from "./newsItem.module.css";
interface NewsItemProps {
  item: {
    id: string;
    date: string;
    title: string;
  };
}

export function NewsItem({ item }: NewsItemProps) {
  return (
    <li className={styles.newsItem}>
      <Link href={`/news/${item.id}`} className={styles.newsText}>
        {item.date.replace(/-/g, "/")} {item.title}
      </Link>
    </li>
  );
}
