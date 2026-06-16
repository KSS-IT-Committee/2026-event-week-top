import Link from "next/link";

import styles from "./not-found.module.css";

export default function Unauthorized() {
  return (
    <>
      <div className={styles.wrapper}>
        <h1 className={styles.code}>401</h1>
        <p className={styles.title}>ログインが必要です</p>
        <p className={styles.subtitle}>
          このページを表示するにはログインしてください
        </p>
        <div className={styles.divider} />
        <Link href="/login" className={styles.homeLink}>
          ログインページへ
        </Link>
      </div>
    </>
  );
}
