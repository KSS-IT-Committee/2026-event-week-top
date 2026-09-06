import { and, eq } from "drizzle-orm";

import { lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * How a pending offer ended without the seat moving. The two sides of the
 * same UPDATE — kept in one function so the authorization column and the
 * status it writes can never drift apart:
 *
 *   cancelled — the sender took the offer back  (matched on from_username)
 *   declined  — the recipient turned it down    (matched on to_username)
 */
export type TicketTransferResolution = "cancelled" | "declined";

/**
 * End a pending offer. The actor's username is part of the WHERE clause, so
 * only the sender can cancel and only the recipient can decline — a guessed
 * transfer id touches nothing.
 *
 * Returns whether a row actually changed. false means the offer was already
 * resolved (claimed, cancelled, declined), never existed, or belongs to
 * someone else; callers say "この譲渡は既に処理されています" rather than
 * distinguishing those, which would leak other accounts' offers.
 */
export async function resolveTicketTransfer(
  transferId: number,
  actorUsername: string,
  resolution: TicketTransferResolution,
): Promise<boolean> {
  const actorColumn =
    resolution === "cancelled"
      ? lotteryTicketTransfers.fromUsername
      : lotteryTicketTransfers.toUsername;

  const updated = await db
    .update(lotteryTicketTransfers)
    .set({ status: resolution, resolvedAt: new Date() })
    .where(
      and(
        eq(lotteryTicketTransfers.id, transferId),
        eq(actorColumn, actorUsername),
        eq(lotteryTicketTransfers.status, "pending"),
      ),
    )
    .returning({ id: lotteryTicketTransfers.id });

  return updated.length > 0;
}
