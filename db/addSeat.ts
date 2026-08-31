import { performanceEnum, Seats } from "@/db/schema";
import { db } from "@/lib/db";

export type Performance = (typeof performanceEnum.enumValues)[number];

export async function addSeat(
  username: string,
  performance: Performance,
  seat: string,
) {
  await db.insert(Seats).values({ username, performance, seat }).returning();
}
