import Link from "next/link";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <>
      <main className={styles.wrapper}>
        <h1 className={styles.code}>404</h1>
        <p className={styles.title}>ページが見つかりませんでした</p>
        <p className={styles.subtitle}>
          お探しのページは移動または削除された可能性があります
          <br />
          万が一、URLを探索している場合は、やめてください
        </p>
        <div className={styles.subtitle}>
          <p>もし間違いだと思われる場合は、</p>
          <ul className={styles.contactList}>
            <li>本校生徒の場合は、IT委員会までお知らせください</li>
            <li>
              その他の方は、お手数ですが
              <a href="mailto:koishikawa.itcommittee@gmail.com">
                koishikawa.itcommittee@gmail.com
              </a>
              までお問い合わせください
            </li>
          </ul>
        </div>
        <div className={styles.divider} />
        <Link href="/" className={styles.homeLink}>
          トップへ戻る
        </Link>
      </main>
    </>
  );
}
