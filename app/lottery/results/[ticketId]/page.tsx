import type { Metadata } from "next";
import Link from "next/link";
import { notFound, unauthorized } from "next/navigation";

import { AuthGuard } from "@/app/components/AuthGuard";
import { FloatingMenu } from "@/app/components/FloatingMenu";
import { getLotteryTicket } from "@/db/getLotteryTicket";
import { getPendingTicketTransfer } from "@/db/getPendingTicketTransfer";
import { INTERNAL_ROLES } from "@/lib/access";
import {
  APPLICANT_TYPE_LABELS,
  areLotteryResultsAnnounced,
  describeTicketTransferBlock,
  describeTicketTransferDeadline,
  getActLabel,
  getLottery,
  getSlotLabel,
  getSlotTime,
} from "@/lib/lotteries";
import { getCurrentUser } from "@/lib/session";

import { DiscardPanel } from "./DiscardPanel";
import styles from "./ticket.module.css";
import { TransferPanel } from "./TransferPanel";

export const metadata: Metadata = {
  title: "当選チケット | 行事週間2026",
  description: "行事週間2026 公演観覧抽選 当選チケットの詳細・譲渡・破棄",
};

// Ownership, the announcement gate and the transfer deadline are all read at
// request time; a statically generated copy would freeze all three.
export const dynamic = "force-dynamic";

type TicketPageProps = {
  params: Promise<{ ticketId: string }>;
};

export default async function TicketPage({ params }: TicketPageProps) {
  const { ticketId } = await params;

  return (
    <AuthGuard role={INTERNAL_ROLES}>
      <TicketDetail rawTicketId={ticketId} />
      <FloatingMenu
        items={[
          { label: "抽選結果", href: "/lottery/results" },
          { label: "観覧抽選トップ", href: "/lottery" },
          { label: "Top", href: "/" },
        ]}
      />
    </AuthGuard>
  );
}

async function TicketDetail({ rawTicketId }: { rawTicketId: string }) {
  const user = await getCurrentUser();
  // AuthGuard already 401s before children render; the re-check narrows the
  // type (getCurrentUser is request-cached, so it costs nothing).
  if (user === null) unauthorized();

  // Only a plain decimal id addresses a ticket — Number() alone would accept
  // "1e3" and " 12 " as the same seat under three different URLs.
  if (!/^\d+$/.test(rawTicketId)) notFound();
  // Scoped to the holder inside the query: somebody else's ticket and a
  // non-existent one are the same 404, so sequential ids disclose nothing.
  const ticket = await getLotteryTicket(Number(rawTicketId), user.username);
  if (ticket === null) notFound();

  const lottery = getLottery(ticket.lotteryId);
  const now = new Date();
  // An unannounced lottery has no visible tickets, whatever is in the table —
  // the same rule /lottery/results applies, so a direct URL cannot jump it.
  if (lottery === null || !areLotteryResultsAnnounced(lottery, now)) {
    notFound();
  }

  const pendingTransfer = await getPendingTicketTransfer(ticket.id);
  const slotTime = getSlotTime(lottery, ticket.slotId);

  return (
    <div className={styles.main}>
      <section className={styles.card}>
        <Link className={styles.backLink} href="/lottery/results">
          ← 抽選結果一覧へ
        </Link>
        <h1 className={styles.title}>当選チケット</h1>

        <div className={styles.ticket}>
          <span className={styles.ticketLottery}>{lottery.title}</span>
          <span className={styles.ticketSlot}>
            {getSlotLabel(lottery, ticket.slotId)}
            {slotTime !== null && (
              <span className={styles.ticketTime}>{slotTime}</span>
            )}
          </span>
          <span className={styles.ticketAct}>
            {getActLabel(lottery, ticket.actId)}
          </span>
          <span className={styles.ticketMeta}>
            観覧人数 {ticket.partySize}名 ／ 第{ticket.choiceRank}希望 ／{" "}
            {APPLICANT_TYPE_LABELS[ticket.applicantType]}
            {ticket.isPriority && (
              <span className={styles.priorityBadge}>お子様のクラス優先</span>
            )}
          </span>
          <span className={styles.ticketHolder}>{user.username}</span>
        </div>

        <p className={styles.important}>
          公演開始5分前までに当選クラスの受付へお越しください。5分前の時点で不在の場合、当選は無効となります。
        </p>

        <TransferPanel
          ticketId={ticket.id}
          pendingTransferId={pendingTransfer?.id ?? null}
          pendingToUsername={pendingTransfer?.toUsername ?? null}
          transferBlockReason={describeTicketTransferBlock(
            lottery,
            ticket,
            now,
          )}
          transferDeadline={describeTicketTransferDeadline(
            lottery,
            ticket.slotId,
            ticket.actId,
          )}
        />
        <DiscardPanel ticketId={ticket.id} />
      </section>
    </div>
  );
}
