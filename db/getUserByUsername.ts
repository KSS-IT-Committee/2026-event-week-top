import { eq } from "drizzle-orm";
import { connection } from "next/server";

import { users } from "@/db/schema";
import { db } from "@/lib/db";

export async function getUserByUsername(username: string) {
  await connection();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));
  return user ?? null;
}
