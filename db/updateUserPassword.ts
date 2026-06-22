import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { db, type Executor } from "@/lib/db";

// Replace a user's bcrypt password hash. The change-password flow authorizes
// the caller against the session and re-verifies the current password before
// calling this — never trust a username from form input here. Accepts an
// executor so it can run inside the same transaction as the session purge.
export async function updateUserPassword(
  username: string,
  passwordHash: string,
  executor: Executor = db,
) {
  await executor
    .update(users)
    .set({ passwordHash })
    .where(eq(users.username, username));
}
