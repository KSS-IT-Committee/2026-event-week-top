import { type Performance, Seats } from "@/db/schema";
import { db } from "@/lib/db";

export async function addSeat(
  username: string,
  performance: Performance,
  seat: string,
) {
  await db
    .insert(Seats)
    .values({ username, performance, seat })
    .onConflictDoUpdate({
      target: [Seats.username, Seats.performance],
      set: { seat },
    })
    .returning();
}
