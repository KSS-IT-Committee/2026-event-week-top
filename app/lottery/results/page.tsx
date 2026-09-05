import type { Metadata } from "next";
import Link from "next/link";
import { unauthorized } from "next/navigation";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import styles from "@/app/lottery/results/results.module.css";
import {
  getIncomingTicketTransfers,
  type IncomingTicketTransfer,
} from "@/db/getIncomingTicketTransfers";
import { getLotteryEntries } from "@/db/getLotteryEntries";
import { getLotteryTickets, type LotteryTicket } from "@/db/getLotteryTickets";
import {
  getOutgoingTicketTransfers,
  type OutgoingTicketTransfer,
} from "@/db/getOutgoingTicketTransfers";
import type { LotteryApplicantType } from "@/db/schema";
import { INTERNAL_ROLES } from "@/lib/access";
import {
  APPLICANT_TYPE_LABELS,
  areLotteryResultsAnnounced,
  canApplyToLottery,
  describeResultsAnnouncement,
  describeTicketTransferBlock,
  getActLabel,
  getLottery,
  getSlotLabel,
  getSlotTime,
  LOTTERIES,
  type Lottery,
} from "@/lib/lotteries";
import { getCurrentUser, type SessionUser } from "@/lib/session";

import { TransferInboxItem } from "./TransferInboxItem";

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

  // Every seat this account holds, in one read: a ticket can arrive by 譲渡
  // from someone else, so the page shows what the account HAS rather than
  // what it could have applied for.
  // Outgoing offers come along so the page can spot a mutual EXCHANGE: a seat
  // that blocks an incoming offer is not really a block when it is itself
  // already promised to whoever sent that offer.
  const [tickets, offers, outgoing] = await Promise.all([
    getLotteryTickets(user.username),
    getIncomingTicketTransfers(user.username),
    getOutgoingTicketTransfers(user.username),
  ]);

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
          <li>
            当選したチケットを選ぶと、詳細ページで他の方への譲渡や、チケットの破棄ができます。
          </li>
        </ul>
        <TransferInbox
          offers={offers}
          outgoing={outgoing}
          tickets={tickets}
          now={now}
        />
        <div className={styles.lotteryList}>
          {LOTTERIES.map((lottery) => (
            <LotteryResultCard
              key={lottery.id}
              lottery={lottery}
              user={user}
              tickets={tickets.filter(
                (ticket) => ticket.lotteryId === lottery.id,
              )}
              now={now}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// What pressing the button on one offer would do. Advisory only —
// claimTicketTransferAction re-derives all of it — but it is what turns a dead
// button into an explanation, and a blocked pair into 交換する.
type OfferOutcome = {
  // The caller's own seat that would go the other way, when this offer and one
  // of theirs are a mutual exchange. null for a plain hand-over.
  swapTicket: LotteryTicket | null;
  // Why nothing can be pressed, or null when it can.
  blockedReason: string | null;
};

function resolveOffer(
  lottery: Lottery,
  offered: LotteryTicket,
  tickets: readonly LotteryTicket[],
  outgoing: readonly OutgoingTicketTransfer[],
  fromUsername: string,
  now: Date,
): OfferOutcome {
  const transferBlock = describeTicketTransferBlock(lottery, offered, now);
  if (transferBlock !== null) {
    return { swapTicket: null, blockedReason: transferBlock };
  }

  // Same 区分 only: a 本人 席 and a 保護者 席 for one performance are two
  // different people, which one account may legitimately hold.
  const heldForSlot = tickets.find(
    (ticket) =>
      ticket.lotteryId === offered.lotteryId &&
      ticket.slotId === offered.slotId &&
      ticket.applicantType === offered.applicantType,
  );
  if (heldForSlot === undefined) {
    return { swapTicket: null, blockedReason: null };
  }

  // …unless that seat is already promised to the very person offering this
  // one. Then both sides have pressed 譲渡する and the seats simply cross.
  const isPromisedBack = outgoing.some(
    (transfer) =>
      transfer.ticket.id === heldForSlot.id &&
      transfer.toUsername === fromUsername,
  );
  if (!isPromisedBack) {
    return {
      swapTicket: null,
      blockedReason:
        "同じ公演・同じ区分のチケットを既にお持ちのため、このチケットは受け取れません。お持ちのチケットをその方に譲渡申請すると交換でき、破棄しても受け取れるようになります。",
    };
  }

  // The seat going the other way must itself still be transferable. Same
  // performance and 区分, so this can only differ for a lottery whose ACTS
  // carry the clock (開拓) — none of which are transferable today.
  const returnBlock = describeTicketTransferBlock(lottery, heldForSlot, now);
  if (returnBlock !== null) {
    return { swapTicket: null, blockedReason: returnBlock };
  }
  return { swapTicket: heldForSlot, blockedReason: null };
}

function TransferInbox({
  offers,
  outgoing,
  tickets,
  now,
}: {
  offers: readonly IncomingTicketTransfer[];
  outgoing: readonly OutgoingTicketTransfer[];
  tickets: readonly LotteryTicket[];
  now: Date;
}) {
  // An offer whose lottery is unannounced (or whose definition is gone) stays
  // hidden: the seat is not public yet, so neither is the fact it was won.
  const visible = offers.flatMap((offer) => {
    const lottery = getLottery(offer.ticket.lotteryId);
    if (lottery === null || !areLotteryResultsAnnounced(lottery, now)) {
      return [];
    }
    return [{ offer, lottery }];
  });
  if (visible.length === 0) return null;

  return (
    <section className={styles.inbox}>
      <h2 className={styles.inboxTitle}>
        受け取り待ちのチケット（{visible.length}件）
      </h2>
      <p className={styles.note}>
        他の方から譲渡されたチケットです。「受け取る」を押すと、あなたのチケットになります。
      </p>
      <ul className={styles.offerList}>
        {visible.map(({ offer, lottery }) => {
          const outcome = resolveOffer(
            lottery,
            offer.ticket,
            tickets,
            outgoing,
            offer.fromUsername,
            now,
          );
          return (
            <TransferInboxItem
              key={offer.id}
              transferId={offer.id}
              fromUsername={offer.fromUsername}
              lotteryTitle={lottery.title}
              slotLabel={getSlotLabel(lottery, offer.ticket.slotId)}
              slotTime={getSlotTime(lottery, offer.ticket.slotId)}
              actLabel={getActLabel(lottery, offer.ticket.actId)}
              applicantTypeLabel={
                APPLICANT_TYPE_LABELS[offer.ticket.applicantType]
              }
              partySize={offer.ticket.partySize}
              swapActLabel={
                outcome.swapTicket === null
                  ? null
                  : getActLabel(lottery, outcome.swapTicket.actId)
              }
              blockedReason={outcome.blockedReason}
            />
          );
        })}
      </ul>
    </section>
  );
}

function LotteryResultCard({
  lottery,
  user,
  tickets,
  now,
}: {
  lottery: Lottery;
  user: SessionUser;
  tickets: readonly LotteryTicket[];
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
  // …plus any type they only hold a seat in because someone gave it to them:
  // a 教職員 account can end up with a 保護者 ticket it could never enter for,
  // and hiding it would hide a seat they are entitled to use.
  const shownTypes = [
    ...usableTypes,
    ...new Set(
      tickets
        .map((ticket) => ticket.applicantType)
        .filter((type) => !usableTypes.includes(type)),
    ),
  ];

  return (
    <article className={styles.lotteryCard}>
      <h2 className={styles.lotteryTitle}>{lottery.title}</h2>
      {shownTypes.length === 0 ? (
        <p className={styles.ineligible}>
          このアカウント（{user.username}）はこの抽選の対象外です。
        </p>
      ) : (
        shownTypes.map((applicantType) => (
          <ApplicantTypeResult
            key={applicantType}
            lottery={lottery}
            username={user.username}
            applicantType={applicantType}
            tickets={tickets.filter(
              (ticket) => ticket.applicantType === applicantType,
            )}
            isUsableType={usableTypes.includes(applicantType)}
            showHeading={shownTypes.length > 1}
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
  tickets,
  isUsableType,
  showHeading,
}: {
  lottery: Lottery;
  username: string;
  applicantType: LotteryApplicantType;
  tickets: readonly LotteryTicket[];
  // Whether this account could have entered as this 区分 at all. False for a
  // type it only holds a transferred ticket in, where "applied and lost" is
  // not a thing that could have happened.
  isUsableType: boolean;
  showHeading: boolean;
}) {
  // Needed only to tell "applied and lost" from "never applied", so it is not
  // read at all when there is a seat to show.
  const entries =
    tickets.length === 0 && isUsableType
      ? await getLotteryEntries(username, lottery.id, applicantType)
      : [];

  // Stored ids carry no order; show the seats in the timetable's own order.
  const slotOrder = new Map(
    lottery.slots.map((slot, index) => [slot.id, index] as const),
  );
  const sorted = [...tickets].sort(
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
            {sorted.length}
            件のチケットをお持ちです。下記の公演をご覧いただけます。
          </p>
          <ul className={styles.seatList}>
            {sorted.map((ticket) => {
              const time = getSlotTime(lottery, ticket.slotId);
              return (
                <li key={ticket.id}>
                  <Link
                    className={styles.seat}
                    href={`/lottery/results/${ticket.id}`}
                  >
                    <span className={styles.seatSlot}>
                      {getSlotLabel(lottery, ticket.slotId)}
                      {time !== null && (
                        <span className={styles.seatTime}>{time}</span>
                      )}
                    </span>
                    <span className={styles.seatAct}>
                      {getActLabel(lottery, ticket.actId)}
                    </span>
                    <span className={styles.seatMeta}>
                      観覧人数 {ticket.partySize}名 ／ 第{ticket.choiceRank}希望
                      {ticket.isPriority && (
                        <span className={styles.priorityBadge}>
                          お子様のクラス優先
                        </span>
                      )}
                    </span>
                    <span className={styles.seatLinkHint}>
                      詳細・譲渡・破棄 →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : entries.length > 0 ? (
        <p className={styles.lost}>
          残念ながら、今回は当選されませんでした。当日のキャンセル待ち列もご利用いただけます。
        </p>
      ) : isUsableType ? (
        <p className={styles.noEntry}>
          この区分でのお申し込みはありませんでした。
        </p>
      ) : null}
    </section>
  );
}
