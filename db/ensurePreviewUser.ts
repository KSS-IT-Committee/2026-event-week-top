import { users } from "@/db/schema";
import { db, type Executor } from "@/lib/db";

// A syntactically valid bcrypt hash of a random secret that was thrown away
// at generation time, so stub accounts can never be logged in with — but
// bcrypt.compare on them fails cleanly instead of throwing on a garbage hash.
const PREVIEW_STUB_PASSWORD_HASH =
  "$2b$12$mHTS3tBwl2qVnrwwFSEHlesNo0HVMTnJo/ku.rLMDLIJ.7rDfG57a";

/**
 * PR previews run against a clone of `appdata` while their sessions are
 * vouched for by the production auth host (see lib/session.ts), so the
 * account a tester is logged in as has to exist locally for any insert
 * referencing users(username) to pass its foreign key.
 *
 * 2026-server-ansible's pr-db.sh seeds each clone with the whole roster
 * (credentials redacted, same stub hash as below) on every preview deploy,
 * which covers that for good. This stays as the backstop for the gaps that
 * seeding leaves: a clone made before seeding existed, an account created
 * after this preview's last deploy, or a run with
 * `apps_pr_preview_seed_users: false`.
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
