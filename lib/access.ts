import "server-only";

import { ROLENAMES } from "@/db/schema";
import type { SessionUser } from "@/lib/session";
import { classOf } from "@/lib/user-category";

export type Role = (typeof ROLENAMES)[number];

/**
 * Whether `user` clears the given role/class constraints. Role and class are
 * two independent axes: `role` is the shared Role enum (db/schema); `class` is
 * a class code such as "3B", matched via classOf() (e.g. "3B12" -> "3B"). The
 * user passes by matching ANY constraint supplied — role OR class — so
 * `<AuthGuard role="IT" classCode="3B">` admits IT members *or* class-3B
 * students; nest guards when you instead need ALL constraints to hold.
 *
 * Roles come off the session object (lib/session.ts fills them from the DB in
 * production and from the auth host on PR previews), so this check does no DB
 * access and is pure — it works on previews, whose local `users` table is empty.
 *
 * `classCode` is a plain string (not a per-app class union) so this file stays
 * byte-identical across the apps, whose class-list modules differ; unknown
 * codes simply never match. Callers pass at least one constraint — the
 * "no constraint, just be internal" case is handled by the guards themselves.
 */
export function hasAccess(
  user: SessionUser,
  role: Role | Role[] | undefined,
  classCode: string | string[] | undefined,
): boolean {
  if (classCode !== undefined) {
    const allowed = Array.isArray(classCode) ? classCode : [classCode];
    const userClass = classOf(user.username);
    if (userClass !== null && allowed.includes(userClass)) {
      return true;
    }
  }

  if (role !== undefined) {
    const required = Array.isArray(role) ? role : [role];
    if (required.some((r) => user.roles.includes(r))) {
      return true;
    }
  }

  return false;
}
