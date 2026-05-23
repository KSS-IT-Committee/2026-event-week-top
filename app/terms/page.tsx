import type { Metadata } from "next";
import Link from "next/link";

import { defaultFooter } from "@/app/components/footer";

import styles from "./terms.module.css";

export const metadata: Metadata = {
  title: "ご利用にあたって | 2026行事週間",
  description: "「2026行事週間」ウェブサイトのご利用にあたってのお願いです。",
};

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <h1 className={styles.title}>ご利用にあたって</h1>

        <p>
          このサイトは、東京都立小石川中等教育学校の行事運営委員会・IT委員会が
          2026年度の行事週間についてお知らせするために運営しています。
          ご利用にあたって、いくつかお願いがあります。
        </p>

        <p>
          サイトの一部の機能では、Clerk（米国の認証サービス）を使ってログインします。
          ログインの仕組み上、メールアドレスなどの情報が Clerk
          のサーバー（米国）に保存される
          ことがあります。あらかじめご了承ください。
          ログイン情報は人に教えたり貸したりしないでください。
        </p>

        <p>
          サイト内の文章・画像・デザインは、無断での転載や複製はご遠慮ください。
          掲載されている情報は、できる限り正確にお伝えするよう努めていますが、
          内容は予告なく変更・修正されることがあります。
        </p>

        <p>
          みんなが気持ちよく使えるサイトにしたいので、
          他の人の迷惑になる行為、サイトの運営を妨げるような行為、
          不正アクセスや、なりすましといった行為はやめてください。
        </p>

        <p>
          ご不明な点があれば、
          <a href="mailto:koishikawa.itcommittee@gmail.com">IT委員会</a>
          までお問い合わせください。
        </p>

        <p className={styles.back}>
          <Link href="/">← トップへ戻る</Link>
        </p>
      </article>
      {defaultFooter()}
    </main>
  );
}
