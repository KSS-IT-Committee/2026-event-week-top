import { eq } from "drizzle-orm";

import { sessions } from "@/db/schema";
import { db } from "@/lib/db";

// Delete every session row for a user. Used after a password change so the new
// password invalidates logins on all other devices; the caller then re-issues a
// fresh session for the device that performed the change. Keyed by username, so
// it needs no knowledge of any current token.
export async function deleteUserSessions(username: string) {
  await db.delete(sessions).where(eq(sessions.username, username));
}
