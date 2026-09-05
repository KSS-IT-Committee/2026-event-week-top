import { and, eq } from "drizzle-orm";

import { lotteryResults } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * 破棄 — throw one seat away for good. The row is deleted outright (no
 * tombstone, no "cancelled" flag), which is exactly what the page warns
 * about: nothing can bring it back, and the physical seat is refilled from
 * the day's キャンセル待ち列 rather than by any DB state.
 *
 * Scoped to the holder, so a stray id can only ever destroy the caller's own
 * ticket. Any 譲渡 offers on the seat go with it (`lottery_ticket_transfers`
 * cascades on `result_id`).
 *
 * Returns whether a row was actually deleted — false means the ticket was
 * already gone, or was never the caller's.
 */
export async function deleteLotteryTicket(
  ticketId: number,
  username: string,
): Promise<boolean> {
  const deleted = await db
    .delete(lotteryResults)
    .where(
      and(
        eq(lotteryResults.id, ticketId),
        eq(lotteryResults.username, username),
      ),
    )
    .returning({ id: lotteryResults.id });
  return deleted.length > 0;
}
