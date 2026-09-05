import { and, eq, ne } from "drizzle-orm";

import type { LotteryTicket } from "@/db/getLotteryTickets";
import { lotteryResults, lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/pg-error";

// One seat per (lottery, slot, account, 区分) — the constraint that makes
// "nobody is in two rooms at once" true (db/schema.ts).
const ONE_SEAT_PER_SLOT = "lottery_results_slot_applicant_unique";

export type ClaimTicketTransferResult =
  | { ok: true; ticket: LotteryTicket }
  // No pending offer with that id for this account — already claimed,
  // cancelled, declined, or never theirs.
  | { ok: false; reason: "not-found" }
  // The recipient already holds a seat for that performance in the same
  // 区分, so taking this one would put them in two rooms at once.
  | { ok: false; reason: "conflict" };

/**
 * 受け取る — move one offered seat to the account it was offered to.
 *
 * The seat is REWRITTEN in place (`lottery_results.username`) rather than
 * copied: a seat is one row for its whole life, so the reception desk's
 * tallies, the results page and the draw's own unique key all keep working
 * without knowing transfers exist. `is_priority` is cleared on the way — it
 * recorded that the ORIGINAL holder got the seat through their child's-class
 * guarantee, which says nothing about whoever now holds it; the transfer row
 * left behind is where that provenance lives instead.
 *
 * The conflict rule is the same 区分 only: a 本人 seat and a 保護者 seat for
 * the same performance are two different people (the student and their
 * parents), a combination one account can already hold today, so only a
 * second seat of the SAME 区分 is refused.
 *
 * Whether the performance is still far enough away to hand the seat over is
 * config, not data — callers check canTransferTicket() first.
 */
export async function claimTicketTransfer(
  transferId: number,
  username: string,
): Promise<ClaimTicketTransferResult> {
  try {
    return await db.transaction(async (tx) => {
      // Lock the offer first: two clicks on 受け取る, or a cancel racing the
      // claim, then queue behind each other instead of both winning.
      const [transfer] = await tx
        .select({
          id: lotteryTicketTransfers.id,
          resultId: lotteryTicketTransfers.resultId,
        })
        .from(lotteryTicketTransfers)
        .where(
          and(
            eq(lotteryTicketTransfers.id, transferId),
            eq(lotteryTicketTransfers.toUsername, username),
            eq(lotteryTicketTransfers.status, "pending"),
          ),
        )
        .for("update");
      if (transfer === undefined) {
        return { ok: false, reason: "not-found" } as const;
      }

      const [ticket] = await tx
        .select()
        .from(lotteryResults)
        .where(eq(lotteryResults.id, transfer.resultId))
        .for("update");
      // The offer's foreign key cascades, so a deleted seat takes its offers
      // with it and this cannot fire — belt and braces against a future
      // schema that softens the cascade.
      if (ticket === undefined) {
        return { ok: false, reason: "not-found" } as const;
      }

      const [conflict] = await tx
        .select({ id: lotteryResults.id })
        .from(lotteryResults)
        .where(
          and(
            eq(lotteryResults.lotteryId, ticket.lotteryId),
            eq(lotteryResults.slotId, ticket.slotId),
            eq(lotteryResults.applicantType, ticket.applicantType),
            eq(lotteryResults.username, username),
            ne(lotteryResults.id, ticket.id),
          ),
        )
        .limit(1);
      if (conflict !== undefined) {
        return { ok: false, reason: "conflict" } as const;
      }

      await tx
        .update(lotteryResults)
        .set({ username, isPriority: false })
        .where(eq(lotteryResults.id, ticket.id));
      await tx
        .update(lotteryTicketTransfers)
        .set({ status: "claimed", resolvedAt: new Date() })
        .where(eq(lotteryTicketTransfers.id, transfer.id));

      return {
        ok: true,
        ticket: {
          id: ticket.id,
          lotteryId: ticket.lotteryId,
          slotId: ticket.slotId,
          actId: ticket.actId,
          applicantType: ticket.applicantType,
          partySize: ticket.partySize,
          choiceRank: ticket.choiceRank,
          isPriority: false,
        },
      } as const;
    });
  } catch (error) {
    // Two offers of the same performance + 区分 claimed at once: both pass
    // the conflict SELECT, and the second UPDATE trips the unique key. Same
    // answer as losing the race by a millisecond.
    if (isUniqueViolation(error, ONE_SEAT_PER_SLOT)) {
      return { ok: false, reason: "conflict" };
    }
    throw error;
  }
}
