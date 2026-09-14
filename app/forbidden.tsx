import type { Metadata } from "next";
import Link from "next/link";

import styles from "./not-found.module.css";

// Title and description only. Next already marks this route noindex on its
// own — the error boundary injects <meta name="robots" content="noindex"> into
// the fallback it renders — so an explicit robots field here would just add
// another copy of a directive the page already carries.
export const metadata: Metadata = {
  title: "アクセス権限がありません",
  description: "このページを表示する権限がありません。",
};

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
