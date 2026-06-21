import type { Metadata } from "next";

import { FloatingMenu } from "@/app/components/FloatingMenu";
import { safeNextPath } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";

import { ChangePasswordForm } from "./ChangePasswordForm";
import styles from "./login.module.css";
import { LoginForm } from "./LoginForm";
import { LogoutForm } from "./LogoutForm";

export const metadata: Metadata = {
  title: "ログイン | 行事週間2026",
  description: "行事週間2026 各サイト共通のログインページ",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [user, { next }] = await Promise.all([getCurrentUser(), searchParams]);

  // Sanitize once on the server so the change-password return link (rendered as
  // an href) can never become an open redirect or a `javascript:` URL.
  const returnTo = next !== undefined ? safeNextPath(next) : undefined;

  return (
    <>
      <div className={styles.main}>
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
              <LogoutForm next={next} />
              <hr className={styles.divider} />
              <h2 className={styles.subtitle}>パスワードの変更</h2>
              <p className={styles.note}>
                配布されたパスワードを、自分だけが知っているものに変更できます。各サイト共通のパスワードなので、変更すると他の端末・サイトからはログアウトされます。
              </p>
              <ChangePasswordForm next={returnTo} />
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
      </div>
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </>
  );
}
