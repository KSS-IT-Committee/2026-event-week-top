import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unauthorized } from "next/navigation";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { getLotteryEntries } from "@/db/getLotteryEntries";
import { isLotteryApplicantType, type LotteryApplicantType } from "@/db/schema";
import {
  APPLICANT_TYPE_LABELS,
  canApplyToLottery,
  describeEligibleGrades,
  getLottery,
  getLotteryAvailability,
  type Lottery,
} from "@/lib/lotteries";
import { getCurrentUser } from "@/lib/session";

import styles from "../lottery.module.css";
import { LotteryEntryForm } from "./LotteryEntryForm";

export const metadata: Metadata = {
  title: "公演観覧抽選 | 行事週間2026",
  description: "行事週間2026 公演観覧抽選の希望申込ページ",
};

type LotteryDetailPageProps = {
  params: Promise<{ lotteryId: string }>;
  searchParams: Promise<{ as?: string | string[] }>;
};

export default async function LotteryDetailPage({
  params,
  searchParams,
}: LotteryDetailPageProps) {
  const [{ lotteryId }, { as }] = await Promise.all([params, searchParams]);
  const lottery = getLottery(lotteryId);
  if (lottery === null) notFound();

  return (
    <AuthGuard>
      <LotteryDetail
        lottery={lottery}
        requestedType={typeof as === "string" ? as : undefined}
      />
      <FloatingMenu
        items={[
          { label: "観覧抽選トップ", href: "/lottery" },
          { label: "Top", href: "/" },
        ]}
      />
    </AuthGuard>
  );
}

async function LotteryDetail({
  lottery,
  requestedType,
}: {
  lottery: Lottery;
  requestedType?: string;
}) {
  const user = await getCurrentUser();
  // AuthGuard already 401s before children render; the re-check narrows the
  // type (getCurrentUser is request-cached, so it costs nothing).
  if (user === null) unauthorized();

  // ?as= picks between the lottery's applicant types (tabs below); anything
  // else falls back to the first offered type.
  const applicantType: LotteryApplicantType =
    requestedType !== undefined &&
    isLotteryApplicantType(requestedType) &&
    lottery.applicantTypes.includes(requestedType)
      ? requestedType
      : lottery.applicantTypes[0];

  const canApply = canApplyToLottery(lottery, user.username, applicantType);
  const availability = getLotteryAvailability(lottery, new Date());
  const savedEntries = canApply
    ? await getLotteryEntries(user.username, lottery.id, applicantType)
    : [];
  const defaultChoices = Object.fromEntries(
    savedEntries.map((entry) => [entry.slotId, entry.choices]),
  );

  return (
    <div className={styles.main}>
      <section className={styles.card}>
        <h1 className={styles.title}>{lottery.title}</h1>
        <p className={styles.note}>{lottery.description}</p>
        <ul className={styles.notesList}>
          {lottery.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        {lottery.applicantTypes.length > 1 && (
          <nav className={styles.tabs} aria-label="申込者の区分">
            {lottery.applicantTypes.map((type) => (
              <Link
                key={type}
                className={
                  type === applicantType
                    ? `${styles.tab} ${styles.tabActive}`
                    : styles.tab
                }
                href={`/lottery/${lottery.id}?as=${type}`}
                aria-current={type === applicantType ? "page" : undefined}
              >
                {APPLICANT_TYPE_LABELS[type]}
              </Link>
            ))}
          </nav>
        )}
        <p className={styles.applicantNote}>
          {APPLICANT_TYPE_LABELS[applicantType]}としての申込（アカウント:{" "}
          {user.username}）
        </p>
        {availability === "upcoming" && (
          <p className={styles.closed}>申込受付はまだ始まっていません。</p>
        )}
        {availability === "closed" && (
          <p className={styles.closed}>
            申込受付は終了しました。
            {canApply && "保存済みの希望は以下のとおりです。"}
          </p>
        )}
        {canApply ? (
          // Keyed so switching tabs (or lotteries) remounts the form and
          // reloads that applicant type's saved choices into its state.
          <LotteryEntryForm
            key={`${lottery.id}-${applicantType}`}
            lotteryId={lottery.id}
            applicantType={applicantType}
            slots={lottery.slots}
            acts={lottery.acts}
            defaultChoices={defaultChoices}
            isOpen={availability === "open"}
          />
        ) : (
          <p className={styles.ineligible}>
            この抽選は{describeEligibleGrades(lottery)}
            のクラスのアカウントが対象です。
            {applicantType === "parent" &&
              "保護者の方はお子様のアカウントでログインしてください。"}
          </p>
        )}
      </section>
    </div>
  );
}
