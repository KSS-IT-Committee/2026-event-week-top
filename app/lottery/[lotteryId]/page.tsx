import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unauthorized } from "next/navigation";
import { Suspense } from "react";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { PageLoading } from "@/app/components/PageLoading";
import { getLotteryEntries } from "@/db/getLotteryEntries";
import { isLotteryApplicantType, type LotteryApplicantType } from "@/db/schema";
import { INTERNAL_ROLES } from "@/lib/access";
import {
  APPLICANT_TYPE_LABELS,
  canApplyToLottery,
  describeApplicationDeadline,
  describeEligibleGrades,
  getLottery,
  getLotteryAvailability,
  type Lottery,
  MAX_PARTY_SIZE_BY_APPLICANT_TYPE,
} from "@/lib/lotteries";
import { getCurrentUser } from "@/lib/session";

import styles from "../lottery.module.css";
import { LotteryEntryForm } from "./LotteryEntryForm";
import { PartySizeGuide } from "./PartySizeGuide";

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
    // notFound() above and AuthGuard below both run in the static shell, so
    // the 404/401/403 status is decided before anything streams. Only the
    // DB-backed detail sits inside the Suspense boundary.
    <AuthGuard role={INTERNAL_ROLES}>
      <Suspense fallback={<PageLoading />}>
        <LotteryDetail
          lottery={lottery}
          requestedType={typeof as === "string" ? as : undefined}
        />
      </Suspense>
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
  // type (getCurrentUser is request-cached, so it costs nothing). It cannot
  // actually fire here: this component renders inside a Suspense boundary, and
  // the shell only flushes once AuthGuard — which resolved the same cached
  // user — has passed. Keep new status interrupts out of this component.
  if (user === null) unauthorized();

  // The applicant types THIS viewer can use (e.g. staff never get 保護者).
  // For a fully ineligible viewer nothing matches — fall back to the
  // lottery's own list so the page still renders the 対象外 explanation.
  const usableTypes = lottery.applicantTypes.filter((type) =>
    canApplyToLottery(lottery, user.roles, type),
  );
  const offeredTypes =
    usableTypes.length > 0 ? usableTypes : lottery.applicantTypes;

  // ?as= picks between the offered types (tabs below); anything else falls
  // back to the first of them.
  const applicantType: LotteryApplicantType =
    requestedType !== undefined &&
    isLotteryApplicantType(requestedType) &&
    offeredTypes.includes(requestedType)
      ? requestedType
      : offeredTypes[0];

  const canApply = canApplyToLottery(lottery, user.roles, applicantType);
  const availability = getLotteryAvailability(lottery, new Date());
  const deadline = describeApplicationDeadline(lottery);
  const maxPartySize = MAX_PARTY_SIZE_BY_APPLICANT_TYPE[applicantType];
  const savedEntries = canApply
    ? await getLotteryEntries(user.username, lottery.id, applicantType)
    : [];
  const defaultChoices = Object.fromEntries(
    savedEntries.map((entry) => [entry.slotId, entry.choices]),
  );
  const defaultPartySizes = Object.fromEntries(
    savedEntries.map((entry) => [entry.slotId, entry.partySize]),
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
          {deadline !== null && <li>申込期限は{deadline}です。</li>}
        </ul>
        {maxPartySize > 1 && <PartySizeGuide />}
        {offeredTypes.length > 1 && (
          <nav className={styles.tabs} aria-label="申込者の区分">
            {offeredTypes.map((type) => (
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
        {applicantType === "parent" &&
          canApply &&
          lottery.parentNotes !== undefined && (
            <ul className={`${styles.notesList} ${styles.importantNotes}`}>
              {lottery.parentNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        {availability === "upcoming" && (
          <p className={styles.closed}>申込受付はまだ始まっていません。</p>
        )}
        {availability === "closed" && (
          <p className={styles.closed}>
            申込受付は終了しました。
            {canApply && "送信済みの希望は以下のとおりです。"}
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
            defaultPartySizes={defaultPartySizes}
            maxPartySize={maxPartySize}
            isOpen={availability === "open"}
          />
        ) : (
          <p className={styles.ineligible}>
            この抽選は{describeEligibleGrades(lottery)}のクラス
            {lottery.canStaffApply && "と教職員"}のアカウントが対象です。
            {applicantType === "parent" &&
              "保護者の方はお子様のアカウントでログインしてください。"}
          </p>
        )}
      </section>
    </div>
  );
}
