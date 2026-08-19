import type { Metadata } from "next";
import Link from "next/link";
import { unauthorized } from "next/navigation";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { INTERNAL_ROLES } from "@/lib/access";
import {
  APPLICANT_TYPE_LABELS,
  describeApplicationDeadline,
  describeEligibleGrades,
  getLotteryAvailability,
  isEligibleForLottery,
  LOTTERIES,
} from "@/lib/lotteries";
import { getCurrentUser } from "@/lib/session";

import styles from "./lottery.module.css";

export const metadata: Metadata = {
  title: "公演観覧抽選 | 行事週間2026",
  description: "創作展 開拓部門・創作部門公演の観覧抽選 申込ページ",
};

export default function LotteryIndexPage() {
  return (
    <AuthGuard role={INTERNAL_ROLES}>
      <LotteryIndex />
      <FloatingMenu items={[{ label: "Top", href: "/" }]} />
    </AuthGuard>
  );
}

async function LotteryIndex() {
  const user = await getCurrentUser();
  // AuthGuard already 401s before children render; the re-check narrows the
  // type (getCurrentUser is request-cached, so it costs nothing).
  if (user === null) unauthorized();
  const now = new Date();

  return (
    <div className={styles.main}>
      <section className={styles.card}>
        <h1 className={styles.title}>公演観覧抽選</h1>
        <p className={styles.note}>
          開拓部門・創作部門のクラス劇は、観覧希望を集めて抽選を行います。観覧を希望する公演（開拓部門）や観たいクラス（創作部門）を第1〜第3希望まで選んで申し込んでください。保護者の方はお子様のアカウントでログインして申し込めます。
        </p>
        <div className={styles.lotteryList}>
          {LOTTERIES.map((lottery) => {
            const availability = getLotteryAvailability(lottery, now);
            const isEligible = isEligibleForLottery(lottery, user.roles);
            const deadline = describeApplicationDeadline(lottery);
            return (
              <article key={lottery.id} className={styles.lotteryCard}>
                <h2 className={styles.lotteryTitle}>{lottery.title}</h2>
                <p className={styles.lotteryMeta}>
                  対象: {describeEligibleGrades(lottery)}のクラス（
                  {lottery.applicantTypes
                    .map((type) => APPLICANT_TYPE_LABELS[type])
                    .join("・")}
                  ）{lottery.canStaffApply && "と教職員"}
                </p>
                {deadline !== null && (
                  <p className={styles.lotteryMeta}>申込期限: {deadline}</p>
                )}
                <p className={styles.lotteryDescription}>
                  {lottery.description}
                </p>
                {availability === "upcoming" && (
                  <p className={styles.closed}>
                    申込受付はまだ始まっていません。
                  </p>
                )}
                {availability === "closed" && (
                  <p className={styles.closed}>申込受付は終了しました。</p>
                )}
                {isEligible ? (
                  <Link
                    className={styles.applyLink}
                    href={`/lottery/${lottery.id}`}
                  >
                    申込ページへ
                  </Link>
                ) : (
                  <p className={styles.ineligible}>
                    このアカウント（{user.username}）は対象外です。
                  </p>
                )}
              </article>
            );
          })}
          <p>
            創作部門の劇内容は
            <Link className={styles.descriptionLink} href="/sousaku-list">
              こちら
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
