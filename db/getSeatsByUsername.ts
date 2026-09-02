import { eq } from "drizzle-orm";
import { connection } from "next/server";

import { Seats } from "@/db/schema";
import { db } from "@/lib/db";

export async function getSeatsByUsername(username: string) {
  await connection();
  return db.select().from(Seats).where(eq(Seats.username, username));
}
