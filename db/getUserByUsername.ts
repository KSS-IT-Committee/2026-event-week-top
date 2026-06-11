import { eq } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/lib/db";

import { users } from "./schema";

export async function getUserByUsername(username: string) {
  await connection();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));
  return user ?? null;
}
