import { and, eq } from "drizzle-orm";
import { connection } from "next/server";

import { lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";

export type PendingTicketTransfer = {
  id: number;
  toUsername: string;
  createdAt: Date;
};

/**
 * The offer currently outstanding on one seat, or null when it is not being
 * handed over. There can only be one (`lottery_ticket_transfers`' partial
 * unique index on `result_id` where status = 'pending'), which is what lets
 * the ticket page show a single 「譲渡を取り消す」 rather than a list.
 *
 * Not scoped to the sender: the caller has already resolved the ticket
 * through getLotteryTicket(), which is the ownership check.
 */
export async function getPendingTicketTransfer(
  ticketId: number,
): Promise<PendingTicketTransfer | null> {
  await connection();

  const [row] = await db
    .select({
      id: lotteryTicketTransfers.id,
      toUsername: lotteryTicketTransfers.toUsername,
      createdAt: lotteryTicketTransfers.createdAt,
    })
    .from(lotteryTicketTransfers)
    .where(
      and(
        eq(lotteryTicketTransfers.resultId, ticketId),
        eq(lotteryTicketTransfers.status, "pending"),
      ),
    );

  return row ?? null;
}
