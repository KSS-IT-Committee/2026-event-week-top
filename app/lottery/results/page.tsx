import type { Metadata } from "next";
import { unauthorized } from "next/navigation";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import styles from "@/app/lottery/results/results.module.css";
import { getLotteryEntries } from "@/db/getLotteryEntries";
import { getLotteryResults } from "@/db/getLotteryResults";
import type { LotteryApplicantType } from "@/db/schema";
import { INTERNAL_ROLES } from "@/lib/access";
import {
  APPLICANT_TYPE_LABELS,
  areLotteryResultsAnnounced,
  canApplyToLottery,
  describeResultsAnnouncement,
  getActLabel,
  getSlotLabel,
  getSlotTime,
  LOTTERIES,
  type Lottery,
} from "@/lib/lotteries";
import { getCurrentUser, type SessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "公演観覧抽選 結果 | 行事週間2026",
  description: "行事週間2026 公演観覧抽選の当選結果ページ",
};

// The announcement time is read from the server clock, so this page must be
// rendered per request — a statically generated copy would freeze "not yet
// announced" in place and never publish.
export const dynamic = "force-dynamic";

export default function LotteryResultsPage() {
  return (
    <AuthGuard role={INTERNAL_ROLES}>
      <LotteryResults />
      <FloatingMenu
        items={[
          { label: "観覧抽選トップ", href: "/lottery" },
          { label: "Top", href: "/" },
        ]}
      />
    </AuthGuard>
  );
}

async function LotteryResults() {
  const user = await getCurrentUser();
  // AuthGuard already 401s before children render; the re-check narrows the
  // type (getCurrentUser is request-cached, so it costs nothing).
  if (user === null) unauthorized();
  const now = new Date();

  return (
    <div className={styles.main}>
      <section className={styles.card}>
        <h1 className={styles.title}>公演観覧抽選 結果</h1>
        <p className={styles.note}>
          お申し込みいただいた公演観覧抽選の結果です。ログイン中のアカウント（
          {user.username}
          ）宛の結果を表示しています。保護者の方の結果は、お子様のアカウントでご確認ください。
        </p>
        <ul className={styles.notesList}>
          <li className={styles.important}>
            当選された方は、必ず公演開始5分前までに当選クラスの受付へお越しください。5分前の時点で不在の場合、当選は無効となります。
          </li>
          <li>
            抽選の結果、定員に満たなかった分はキャンセル待ちの列から補填されます。抽選に外れたがどうしても観たい公演がある場合は、お早めにキャンセル待ち列へお並びください。
          </li>
        </ul>
        <div className={styles.lotteryList}>
          {LOTTERIES.map((lottery) => (
            <LotteryResultCard
              key={lottery.id}
              lottery={lottery}
              user={user}
              now={now}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

async function LotteryResultCard({
  lottery,
  user,
  now,
}: {
  lottery: Lottery;
  user: SessionUser;
  now: Date;
}) {
  const announcement = describeResultsAnnouncement(lottery);

  if (!areLotteryResultsAnnounced(lottery, now)) {
    return (
      <article className={styles.lotteryCard}>
        <h2 className={styles.lotteryTitle}>{lottery.title}</h2>
        <p className={styles.pending}>
          {announcement === null
            ? "当選結果はまだ発表されていません。発表日時が決まりましたらこのページでお知らせします。"
            : `当選結果は${announcement}に発表予定です。`}
        </p>
      </article>
    );
  }

  // The types this viewer could have applied as — a staff account never gets
  // a 保護者 result, so we never claim they lost one.
  const usableTypes = lottery.applicantTypes.filter((type) =>
    canApplyToLottery(lottery, user.roles, type),
  );

  return (
    <article className={styles.lotteryCard}>
      <h2 className={styles.lotteryTitle}>{lottery.title}</h2>
      {usableTypes.length === 0 ? (
        <p className={styles.ineligible}>
          このアカウント（{user.username}）はこの抽選の対象外です。
        </p>
      ) : (
        usableTypes.map((applicantType) => (
          <ApplicantTypeResult
            key={applicantType}
            lottery={lottery}
            username={user.username}
            applicantType={applicantType}
            showHeading={usableTypes.length > 1}
          />
        ))
      )}
    </article>
  );
}

async function ApplicantTypeResult({
  lottery,
  username,
  applicantType,
  showHeading,
}: {
  lottery: Lottery;
  username: string;
  applicantType: LotteryApplicantType;
  showHeading: boolean;
}) {
  const [results, entries] = await Promise.all([
    getLotteryResults(username, lottery.id, applicantType),
    // Needed only to tell "applied and lost" from "never applied".
    getLotteryEntries(username, lottery.id, applicantType),
  ]);

  // Stored ids carry no order; show the seats in the timetable's own order.
  const slotOrder = new Map(
    lottery.slots.map((slot, index) => [slot.id, index] as const),
  );
  const sorted = [...results].sort(
    (a, b) =>
      (slotOrder.get(a.slotId) ?? Number.MAX_SAFE_INTEGER) -
      (slotOrder.get(b.slotId) ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <section className={styles.applicantSection}>
      {showHeading && (
        <h3 className={styles.applicantTitle}>
          {APPLICANT_TYPE_LABELS[applicantType]}
        </h3>
      )}
      {sorted.length > 0 ? (
        <>
          <p className={styles.won}>
            {sorted.length}件当選しました。下記の公演をご覧いただけます。
          </p>
          <ul className={styles.seatList}>
            {sorted.map((result) => {
              const time = getSlotTime(lottery, result.slotId);
              return (
                <li
                  key={`${result.slotId}-${result.actId}`}
                  className={styles.seat}
                >
                  <span className={styles.seatSlot}>
                    {getSlotLabel(lottery, result.slotId)}
                    {time !== null && (
                      <span className={styles.seatTime}>{time}</span>
                    )}
                  </span>
                  <span className={styles.seatAct}>
                    {getActLabel(lottery, result.actId)}
                  </span>
                  <span className={styles.seatMeta}>
                    観覧人数 {result.partySize}名 ／ 第{result.choiceRank}希望
                    {result.isPriority && (
                      <span className={styles.priorityBadge}>
                        お子様のクラス優先
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : entries.length > 0 ? (
        <p className={styles.lost}>
          残念ながら、今回は当選されませんでした。当日のキャンセル待ち列もご利用いただけます。
        </p>
      ) : (
        <p className={styles.noEntry}>
          この区分でのお申し込みはありませんでした。
        </p>
      )}
    </section>
  );
}
