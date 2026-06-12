import type { Metadata } from "next";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import { Footer } from "@/app/components/Footer";
import { getCurrentUser } from "@/lib/session";

import { logoutAction } from "./actions";
import styles from "./login.module.css";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "ログイン | 行事週間2026",
  description: "行事週間2026 各サイト共通のログインページ",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [user, { next }] = await Promise.all([getCurrentUser(), searchParams]);

  return (
    <>
      <main className={styles.main}>
        <section className={styles.card}>
          <h1 className={styles.title}>ログイン</h1>
          {user !== null ? (
            <>
              <p className={styles.loggedIn}>
                <span className={styles.username}>{user.username}</span>
                <span> としてログイン中です。</span>
              </p>
              <p className={styles.note}>
                このログインは行事週間の各サイトで共通して使えます。
              </p>
              <form action={logoutAction}>
                <button className={styles.logoutButton} type="submit">
                  ログアウト
                </button>
              </form>
            </>
          ) : (
            <>
              <p className={styles.note}>
                配布されたアカウントカードのユーザー名とパスワードを入力してください。
              </p>
              <LoginForm next={next} />
            </>
          )}
        </section>
      </main>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
      <Footer />
    </>
  );
}
