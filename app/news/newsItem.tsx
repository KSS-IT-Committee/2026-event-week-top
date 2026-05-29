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
      <time className={styles.newsDate} dateTime={item.date}>
        {item.date.replace(/-/g, "/")}
      </time>
      <Link href={`/news/${item.id}`} className={styles.newsText}>
        {item.title}
      </Link>
    </li>
  );
}