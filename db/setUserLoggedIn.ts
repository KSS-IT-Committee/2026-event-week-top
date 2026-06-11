import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { db } from "@/lib/db";

// Latch `has_logged_in` to true on a successful login. Idempotent and
// monotonic — it only ever sets true, so the flag never reverts.
export async function setUserLoggedIn(username: string) {
  await db
    .update(users)
    .set({ hasLoggedIn: true })
    .where(eq(users.username, username));
}
