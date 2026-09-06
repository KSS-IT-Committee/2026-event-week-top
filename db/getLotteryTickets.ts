import { eq } from "drizzle-orm";
import { connection } from "next/server";

import { type LotteryApplicantType, lotteryResults } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * One seat an account currently holds — a `lottery_results` row seen as a
 * ticket. `id` is that row's primary key and the seat's stable handle: it is
 * what /lottery/results/[ticketId] addresses and what a 譲渡 offer points at,
 * and it survives the seat changing hands (claiming rewrites the row's
 * `username` rather than moving the seat to a new row).
 */
export type LotteryTicket = {
  id: number;
  lotteryId: string;
  slotId: string;
  // The act won: a class code for sousaku, a performance id for kaitaku.
  actId: string;
  applicantType: LotteryApplicantType;
  // 観覧人数 admitted by this seat.
  partySize: number;
  // Which ranked choice won (1 = 第1希望).
  choiceRank: number;
  // A 保護者 seat granted by the child's-class guarantee, not by the draw.
  // Cleared when the seat is handed to another account: the guarantee was
  // about the original holder's child, so it says nothing about the new one.
  isPriority: boolean;
};

/**
 * Every seat one account holds, across all lotteries and applicant types.
 *
 * Deliberately NOT filtered by which applicant types the account could have
 * applied as: a seat can arrive by 譲渡 from someone else, so a 教職員 account
 * may legitimately hold a 保護者 ticket it could never have entered for. The
 * page groups the rows it gets back; an empty result means no seat — which is
 * a loss only if the account actually applied, so callers pair this with
 * getLotteryEntries to tell the two apart.
 *
 * This never decides whether results may be SHOWN: that is
 * areLotteryResultsAnnounced() in lib/lotteries.ts, checked by the page.
 */
export async function getLotteryTickets(
  username: string,
): Promise<LotteryTicket[]> {
  await connection();

  const rows = await db
    .select()
    .from(lotteryResults)
    .where(eq(lotteryResults.username, username));

  return rows.map((row) => ({
    id: row.id,
    lotteryId: row.lotteryId,
    slotId: row.slotId,
    actId: row.actId,
    applicantType: row.applicantType,
    partySize: row.partySize,
    choiceRank: row.choiceRank,
    isPriority: row.isPriority,
  }));
}
