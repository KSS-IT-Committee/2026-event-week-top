import { users } from "@/db/schema";
import { db, type Executor } from "@/lib/db";

// A syntactically valid bcrypt hash of a random secret that was thrown away
// at generation time, so stub accounts can never be logged in with — but
// bcrypt.compare on them fails cleanly instead of throwing on a garbage hash.
const PREVIEW_STUB_PASSWORD_HASH =
  "$2b$12$mHTS3tBwl2qVnrwwFSEHlesNo0HVMTnJo/ku.rLMDLIJ.7rDfG57a";

/**
 * PR previews run against a schema-only clone of `appdata` — its `users`
 * table is empty — while sessions are vouched for by the production auth
 * host (see lib/session.ts). Any insert referencing users(username) would
 * therefore fail its foreign key on a preview even for a perfectly valid
 * login. This materializes the vouched-for account as a stub row so those
 * writes succeed.
 *
 * No-op outside previews (IS_PR_PREVIEW is only ever set by the preview
 * deploy infra) and for usernames that already have a row, so production
 * and local users are never created or modified here.
 */
export async function ensurePreviewUser(
  username: string,
  executor: Executor = db,
) {
  if (process.env.IS_PR_PREVIEW !== "true") return;
  await executor
    .insert(users)
    .values({ username, passwordHash: PREVIEW_STUB_PASSWORD_HASH })
    .onConflictDoNothing();
}
