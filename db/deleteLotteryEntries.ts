import { and, eq } from "drizzle-orm";

import { type LotteryApplicantType, lotteryEntries } from "@/db/schema";
import { db, type Executor } from "@/lib/db";

// Delete every saved entry for one account + applicant type in one lottery.
// A resubmission replaces the previous one wholesale (delete + insert in one
// transaction), so this runs right before addLotteryEntries with the same tx.
// The submit action authorizes the caller against the session before calling
// this — never pass a username taken from form input.
export async function deleteLotteryEntries(
  username: string,
  lotteryId: string,
  applicantType: LotteryApplicantType,
  executor: Executor = db,
) {
  await executor
    .delete(lotteryEntries)
    .where(
      and(
        eq(lotteryEntries.username, username),
        eq(lotteryEntries.lotteryId, lotteryId),
        eq(lotteryEntries.applicantType, applicantType),
      ),
    );
}
