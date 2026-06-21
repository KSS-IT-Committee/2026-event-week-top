import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import { db } from "@/lib/db";

// Replace a user's bcrypt password hash. The change-password flow authorizes
// the caller against the session and re-verifies the current password before
// calling this — never trust a username from form input here.
export async function updateUserPassword(
  username: string,
  passwordHash: string,
) {
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.username, username));
}
