import { and, eq, ne, sql } from "drizzle-orm";

import type { LotteryTicket } from "@/db/getLotteryTickets";
import { lotteryResults, lotteryTicketTransfers } from "@/db/schema";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/pg-error";

// One seat per (lottery, slot, account, 区分) — the constraint that makes
// "nobody is in two rooms at once" true (db/schema.ts).
const ONE_SEAT_PER_SLOT = "lottery_results_slot_applicant_unique";

export type ClaimTicketTransferResult =
  // `exchanged` is true when a second seat went the other way (see below).
  | { ok: true; ticket: LotteryTicket; exchanged: boolean }
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
 * EXCHANGE. That conflict has one way out. If the seat blocking the recipient
 * is itself already offered to the very account making this offer, both people
 * have pressed 譲渡する and the two seats simply cross over — so this claims
 * BOTH transfers and moves BOTH rows in one transaction. Nobody is ever short
 * a ticket in between, which is why an exchange is safe where a general
 * "release my seat and hope" would not be.
 *
 * The crossover needs `lottery_results_slot_applicant_unique` deferred to
 * COMMIT: each row passes through the other's key on the way, and Postgres
 * checks a non-deferrable UNIQUE per row as the UPDATE runs (2026-db migration
 * 0018 made the constraint DEFERRABLE for exactly this).
 *
 * Whether the performance is still far enough away to hand the seat over is
 * config, not data — callers check describeTicketTransferBlock() first.
 */
export async function claimTicketTransfer(
  transferId: number,
  username: string,
): Promise<ClaimTicketTransferResult> {
  try {
    return await db.transaction(async (tx) => {
      // Seats are locked before offers, everywhere. 破棄 has no choice about
      // that order — deleteLotteryTicket removes the `lottery_results` row and
      // the foreign key then cascades into `lottery_ticket_transfers` — so a
      // claim that took the offer first would invert it, and a discard racing
      // a claim on the same seat could deadlock. Hence: an unlocked peek to
      // learn WHICH seat this offer names, the seat's lock, and only then the
      // offer's.
      const [offer] = await tx
        .select({ resultId: lotteryTicketTransfers.resultId })
        .from(lotteryTicketTransfers)
        .where(
          and(
            eq(lotteryTicketTransfers.id, transferId),
            eq(lotteryTicketTransfers.toUsername, username),
            eq(lotteryTicketTransfers.status, "pending"),
          ),
        );
      if (offer === undefined) {
        return { ok: false, reason: "not-found" } as const;
      }

      const [ticket] = await tx
        .select()
        .from(lotteryResults)
        .where(eq(lotteryResults.id, offer.resultId))
        .for("update");
      // The offer's foreign key cascades, so a discard that got here first
      // takes its offers with it and leaves nothing to claim.
      if (ticket === undefined) {
        return { ok: false, reason: "not-found" } as const;
      }

      // Re-read the offer under a lock now that the seat is held: the peek
      // above is advisory, and a cancel or 辞退する may have landed in
      // between. This read is the authoritative one — two clicks on 受け取る,
      // or a cancel racing the claim, queue behind it instead of both winning.
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
      if (transfer === undefined || transfer.resultId !== ticket.id) {
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
        .limit(1)
        // Locked for the same reason the offered seat is: on the exchange
        // path this row is about to be UPDATEd, and 破棄 of it takes the seat
        // before cascading into its offers. Taking the offer first here would
        // invert that and let a discard racing an exchange deadlock.
        .for("update");

      // The blocking seat is only forgiven when it is already promised back to
      // this offer's sender — that mutual consent is the whole justification.
      //
      // Both people pressing 交換する within the same instant take the two
      // SEAT rows in opposite orders (each locks the one being offered to
      // them first), so Postgres may pick one and abort it with a deadlock
      // error. That is detected, never a hang: the loser rolls back untouched
      // and gets the retry message, and by then the winner has already
      // completed the exchange for both of them.
      let counterOffer: { id: number; resultId: number } | undefined;
      if (conflict !== undefined) {
        [counterOffer] = await tx
          .select({
            id: lotteryTicketTransfers.id,
            resultId: lotteryTicketTransfers.resultId,
          })
          .from(lotteryTicketTransfers)
          .where(
            and(
              eq(lotteryTicketTransfers.resultId, conflict.id),
              eq(lotteryTicketTransfers.fromUsername, username),
              eq(lotteryTicketTransfers.toUsername, ticket.username),
              eq(lotteryTicketTransfers.status, "pending"),
            ),
          )
          .for("update");
        if (counterOffer === undefined) {
          return { ok: false, reason: "conflict" } as const;
        }
        // Both rows are about to hold each other's key until COMMIT.
        await tx.execute(
          sql`SET CONSTRAINTS "lottery_results_slot_applicant_unique" DEFERRED`,
        );
      }

      const previousHolder = ticket.username;
      await tx
        .update(lotteryResults)
        .set({ username, isPriority: false })
        .where(eq(lotteryResults.id, ticket.id));
      await tx
        .update(lotteryTicketTransfers)
        .set({ status: "claimed", resolvedAt: new Date() })
        .where(eq(lotteryTicketTransfers.id, transfer.id));

      if (counterOffer !== undefined) {
        await tx
          .update(lotteryResults)
          .set({ username: previousHolder, isPriority: false })
          .where(eq(lotteryResults.id, counterOffer.resultId));
        await tx
          .update(lotteryTicketTransfers)
          .set({ status: "claimed", resolvedAt: new Date() })
          .where(eq(lotteryTicketTransfers.id, counterOffer.id));
      }

      return {
        ok: true,
        exchanged: counterOffer !== undefined,
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
