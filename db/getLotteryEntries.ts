import { and, eq } from "drizzle-orm";
import { connection } from "next/server";

import { type LotteryApplicantType, lotteryEntries } from "@/db/schema";
import { db } from "@/lib/db";

export type LotteryEntrySummary = {
  slotId: string;
  // Rank order (1st, 2nd, 3rd), with unused ranks omitted.
  choices: string[];
  // 観覧人数 (1 unless the applicant type allows more).
  partySize: number;
};

/**
 * Saved viewing-lottery preferences for one account and applicant type.
 * Callers key the result by slotId; slots without an entry mean "not
 * applying for that performance".
 */
export async function getLotteryEntries(
  username: string,
  lotteryId: string,
  applicantType: LotteryApplicantType,
): Promise<LotteryEntrySummary[]> {
  await connection();

  const rows = await db
    .select()
    .from(lotteryEntries)
    .where(
      and(
        eq(lotteryEntries.username, username),
        eq(lotteryEntries.lotteryId, lotteryId),
        eq(lotteryEntries.applicantType, applicantType),
      ),
    );

  return rows.map((row) => ({
    slotId: row.slotId,
    choices: [row.firstChoice, row.secondChoice, row.thirdChoice].filter(
      (choice): choice is string => choice !== null,
    ),
    partySize: row.partySize,
  }));
}
