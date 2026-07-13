import { lotteryEntries, type NewLotteryEntry } from "@/db/schema";
import { db, type Executor } from "@/lib/db";

// Insert validated lottery entries. Rows must already have passed
// parseLotteryEntries (valid slot/act ids, distinct choices) — the schema's
// unique + check constraints are only a backstop. Accepts an executor so the
// insert composes with deleteLotteryEntries in one replace transaction.
export async function addLotteryEntries(
  entries: NewLotteryEntry[],
  executor: Executor = db,
) {
  // Drizzle rejects .values([]) — an all-blank submission just clears.
  if (entries.length === 0) return;
  await executor.insert(lotteryEntries).values(entries);
}
