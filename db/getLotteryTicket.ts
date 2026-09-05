import { and, eq } from "drizzle-orm";
import { connection } from "next/server";

import type { LotteryTicket } from "@/db/getLotteryTickets";
import { lotteryResults } from "@/db/schema";
import { db } from "@/lib/db";

/**
 * One seat by its `lottery_results` id, scoped to the account that holds it.
 *
 * The owner is part of the lookup, not a check the caller is trusted to make
 * afterwards: ticket ids are sequential, so a page that fetched first and
 * compared later would leak "seat 412 exists" to anyone who typed the URL.
 * Someone else's ticket and no such ticket are the same null, and callers
 * answer both with notFound().
 */
export async function getLotteryTicket(
  ticketId: number,
  username: string,
): Promise<LotteryTicket | null> {
  await connection();

  const [row] = await db
    .select()
    .from(lotteryResults)
    .where(
      and(
        eq(lotteryResults.id, ticketId),
        eq(lotteryResults.username, username),
      ),
    );
  if (row === undefined) return null;

  return {
    id: row.id,
    lotteryId: row.lotteryId,
    slotId: row.slotId,
    actId: row.actId,
    applicantType: row.applicantType,
    partySize: row.partySize,
    choiceRank: row.choiceRank,
    isPriority: row.isPriority,
  };
}
