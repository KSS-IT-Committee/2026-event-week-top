import { and, asc, eq } from "drizzle-orm";
import { connection } from "next/server";

import type { LotteryTicket } from "@/db/getLotteryTickets";
import { lotteryResults, lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";

export type OutgoingTicketTransfer = {
  // lottery_ticket_transfers.id — what 譲渡を取り消す names.
  id: number;
  toUsername: string;
  createdAt: Date;
  // The seat being offered. Still the caller's until it is claimed.
  ticket: LotteryTicket;
};

/**
 * Every seat this account is currently offering to someone else.
 *
 * /lottery/results pairs these against the incoming offers to spot a mutual
 * EXCHANGE: when the seat blocking you from claiming an offer is itself
 * promised to the very person making that offer, both people have already
 * consented and the two seats can cross over in one step.
 *
 * Only `pending` rows — a resolved offer is history, and the seat it names may
 * since have moved on.
 */
export async function getOutgoingTicketTransfers(
  username: string,
): Promise<OutgoingTicketTransfer[]> {
  await connection();

  const rows = await db
    .select({
      id: lotteryTicketTransfers.id,
      toUsername: lotteryTicketTransfers.toUsername,
      createdAt: lotteryTicketTransfers.createdAt,
      ticket: lotteryResults,
    })
    .from(lotteryTicketTransfers)
    .innerJoin(
      lotteryResults,
      eq(lotteryResults.id, lotteryTicketTransfers.resultId),
    )
    .where(
      and(
        eq(lotteryTicketTransfers.fromUsername, username),
        eq(lotteryTicketTransfers.status, "pending"),
      ),
    )
    .orderBy(asc(lotteryTicketTransfers.createdAt));

  return rows.map((row) => ({
    id: row.id,
    toUsername: row.toUsername,
    createdAt: row.createdAt,
    ticket: {
      id: row.ticket.id,
      lotteryId: row.ticket.lotteryId,
      slotId: row.ticket.slotId,
      actId: row.ticket.actId,
      applicantType: row.ticket.applicantType,
      partySize: row.ticket.partySize,
      choiceRank: row.ticket.choiceRank,
      isPriority: row.ticket.isPriority,
    },
  }));
}
