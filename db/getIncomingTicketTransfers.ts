import { and, asc, eq } from "drizzle-orm";
import { connection } from "next/server";

import type { LotteryTicket } from "@/db/getLotteryTickets";
import { lotteryResults, lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";

export type IncomingTicketTransfer = {
  // lottery_ticket_transfers.id — what the 受け取る / 辞退する actions name.
  id: number;
  fromUsername: string;
  createdAt: Date;
  // The seat being offered, as it stands right now.
  ticket: LotteryTicket;
};

/**
 * 受け取り待ちのチケット — every seat currently offered to this account, with
 * the seat itself joined in so /lottery/results can render the offer without
 * a second round trip.
 *
 * Only `pending` rows: a resolved offer is history, and the seat it names may
 * since have moved on. Oldest first, so a queue of offers is answered in the
 * order it arrived.
 */
export async function getIncomingTicketTransfers(
  username: string,
): Promise<IncomingTicketTransfer[]> {
  await connection();

  const rows = await db
    .select({
      id: lotteryTicketTransfers.id,
      fromUsername: lotteryTicketTransfers.fromUsername,
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
        eq(lotteryTicketTransfers.toUsername, username),
        eq(lotteryTicketTransfers.status, "pending"),
      ),
    )
    .orderBy(asc(lotteryTicketTransfers.createdAt));

  return rows.map((row) => ({
    id: row.id,
    fromUsername: row.fromUsername,
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
