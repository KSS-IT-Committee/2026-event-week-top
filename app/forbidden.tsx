import Link from "next/link";

import styles from "./not-found.module.css";

export default function Forbidden() {
  return (
    <>
      <div className={styles.wrapper}>
        <h1 className={styles.code}>403</h1>
        <p className={styles.title}>アクセス権限がありません</p>
        <p className={styles.subtitle}>
          このページを表示する権限がありません
          <br />
          ログイン状態と権限をご確認ください
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
      </div>
    </>
  );
}
