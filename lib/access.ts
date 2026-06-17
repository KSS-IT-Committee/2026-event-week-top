import "server-only";

import { eq } from "drizzle-orm";

import { ROLENAMES, users } from "@/db/schema";
import { db } from "@/lib/db";
import { classOf } from "@/lib/user-category";

export type Role = (typeof ROLENAMES)[number];

/**
 * Whether `username` clears the given role/class constraints. Role and class
 * are two independent axes: `role` is the shared Role enum (db/schema); `class`
 * is a class code such as "3B", matched via classOf() (e.g. "3B12" -> "3B").
 * The user passes by matching ANY constraint supplied — role OR class — so
 * `<AuthGuard role="IT" classCode="3B">` admits IT members *or* class-3B
 * students; nest guards when you instead need ALL constraints to hold.
 *
 * `classCode` is a plain string (not a per-app class union) so this file stays
 * byte-identical across the apps, whose class-list modules differ; unknown
 * codes simply never match. Callers pass at least one constraint — the
 * "no constraint, just be internal" case is handled by the guards themselves.
 */
export async function hasAccess(
  username: string,
  role: Role | Role[] | undefined,
  classCode: string | string[] | undefined,
): Promise<boolean> {
  if (classCode !== undefined) {
    const allowed = Array.isArray(classCode) ? classCode : [classCode];
    const userClass = classOf(username);
    if (userClass !== null && allowed.includes(userClass)) {
      return true;
    }
  }

  if (role !== undefined) {
    const required = Array.isArray(role) ? role : [role];
    const [row] = await db
      .select({ roles: users.roles })
      .from(users)
      .where(eq(users.username, username));
    const userRoles = row?.roles ?? [];
    if (required.some((r) => userRoles.includes(r))) {
      return true;
    }
  }

  return false;
}
