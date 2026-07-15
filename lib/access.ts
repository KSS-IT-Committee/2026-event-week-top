import "server-only";

import { ROLENAMES } from "@/db/schema";
import type { SessionUser } from "@/lib/session";

export type Role = (typeof ROLENAMES)[number];

/**
 * The roles that mark a logged-in account as a school-internal user. Every
 * roster account carries one of them via 2026-account-generator's users.sql
 * (students get "Students", staff accounts get "Teachers"), so a guard that
 * means "any logged-in school account" says `role={INTERNAL_ROLES}`
 * explicitly instead of matching username shapes.
 */
export const INTERNAL_ROLES: readonly Role[] = ["Students", "Teachers"];

/**
 * Whether `user` holds at least one of the given roles. This is the only
 * authorization primitive — access is decided by the shared `users.roles`
 * column, never by the shape of the username.
 *
 * Roles come off the session object (lib/session.ts fills them from the DB
 * in production and from the auth host on PR previews), so this check is
 * pure and does no DB access — it works on previews, whose local `users`
 * table is empty. When ALL of several roles must hold, chain calls (or nest
 * guards) instead of widening the list.
 */
export function hasAnyRole(
  user: SessionUser,
  roles: Role | readonly Role[],
): boolean {
  const allowed: readonly Role[] = typeof roles === "string" ? [roles] : roles;
  return allowed.some((role) => user.roles.includes(role));
}
