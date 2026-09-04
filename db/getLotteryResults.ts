import { and, eq } from "drizzle-orm";
import { connection } from "next/server";

import { type LotteryApplicantType, lotteryResults } from "@/db/schema";
import { db } from "@/lib/db";

export type LotteryResultSummary = {
  slotId: string;
  // The act won: a class code for sousaku, a performance id for kaitaku.
  actId: string;
  // 観覧人数 admitted by this seat.
  partySize: number;
  // Which ranked choice won (1 = 第1希望).
  choiceRank: number;
  // A 保護者 seat granted by the child's-class guarantee, not by the draw.
  isPriority: boolean;
};

/**
 * The seats one account won in one lottery, as one applicant type. An empty
 * array means no seat — which is a loss only if the account actually applied,
 * so callers pair this with getLotteryEntries to tell the two apart.
 *
 * This never decides whether results may be SHOWN: that is
 * areLotteryResultsAnnounced() in lib/lotteries.ts, checked by the page
 * before it queries.
 */
export async function getLotteryResults(
  username: string,
  lotteryId: string,
  applicantType: LotteryApplicantType,
): Promise<LotteryResultSummary[]> {
  await connection();

  const rows = await db
    .select()
    .from(lotteryResults)
    .where(
      and(
        eq(lotteryResults.username, username),
        eq(lotteryResults.lotteryId, lotteryId),
        eq(lotteryResults.applicantType, applicantType),
      ),
    );

  return rows.map((row) => ({
    slotId: row.slotId,
    actId: row.actId,
    partySize: row.partySize,
    choiceRank: row.choiceRank,
    isPriority: row.isPriority,
  }));
}
