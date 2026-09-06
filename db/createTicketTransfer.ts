import { and, eq } from "drizzle-orm";

import { lotteryResults, lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/pg-error";

// The partial unique index that makes "one outstanding offer per seat" a
// database fact rather than a hope (db/schema.ts).
const ONE_PENDING_PER_RESULT =
  "lottery_ticket_transfers_one_pending_per_result";

export type CreateTicketTransferResult =
  | { ok: true; transferId: number }
  // The seat is not (or no longer) the sender's — it was claimed by someone
  // else, or discarded, between the page render and the submit.
  | { ok: false; reason: "not-owned" }
  // It is already promised to someone; the sender must cancel that first.
  | { ok: false; reason: "already-pending" };

/**
 * Offer one seat to another account. The seat does not move yet: it stays the
 * sender's until the recipient claims it, so an offer nobody answers costs
 * the sender nothing.
 *
 * Ownership is re-read inside the transaction and locked, so an offer can
 * never be made against a seat the caller has just lost. The recipient's
 * existence is the caller's job (the 譲渡できるか確認する step reads `users`);
 * a username that is not there fails the foreign key rather than writing a
 * dangling offer.
 */
export async function createTicketTransfer(
  ticketId: number,
  fromUsername: string,
  toUsername: string,
): Promise<CreateTicketTransferResult> {
  try {
    return await db.transaction(async (tx) => {
      const [ticket] = await tx
        .select({ id: lotteryResults.id })
        .from(lotteryResults)
        .where(
          and(
            eq(lotteryResults.id, ticketId),
            eq(lotteryResults.username, fromUsername),
          ),
        )
        .for("update");
      if (ticket === undefined) {
        return { ok: false, reason: "not-owned" } as const;
      }

      const [inserted] = await tx
        .insert(lotteryTicketTransfers)
        .values({ resultId: ticketId, fromUsername, toUsername })
        .returning({ id: lotteryTicketTransfers.id });
      return { ok: true, transferId: inserted.id } as const;
    });
  } catch (error) {
    // Two submits racing for the same seat: the loser's INSERT trips the
    // partial unique index. Postgres has already aborted the transaction by
    // then, which is why this is caught out here and not around the INSERT.
    if (isUniqueViolation(error, ONE_PENDING_PER_RESULT)) {
      return { ok: false, reason: "already-pending" };
    }
    throw error;
  }
}
