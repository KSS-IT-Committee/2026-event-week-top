import { eq } from "drizzle-orm";
import { connection } from "next/server";

import { Seats } from "@/db/schema";
import { db } from "@/lib/db";

export async function getSeatByUsername(username: string) {
  await connection();
  const [seat] = await db
    .select()
    .from(Seats)
    .where(eq(Seats.username, username));
  return seat ?? null;
}
