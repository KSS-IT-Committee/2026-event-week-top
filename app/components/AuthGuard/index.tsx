import { forbidden, unauthorized } from "next/navigation";

import { hasAnyRole, type Role } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";

/**
 * Server-side page gate. Renders children only for a logged-in user who
 * holds at least one of the roles in `role`; anonymous visitors get the 401
 * page, logged-in users without a matching role the 403 page.
 *
 * Deny-by-default: with no `role` prop the guard admits NOBODY. Every page
 * must state which roles it expects — `role={INTERNAL_ROLES}` for "any
 * logged-in school account". Username shapes are never consulted. Nest
 * guards when a page needs ALL of several roles to hold.
 */
export async function AuthGuard({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: Role | readonly Role[];
}) {
  const user = await getCurrentUser();
  if (!user) {
    unauthorized(); // 401 — not logged in
  }

  if (role === undefined || !hasAnyRole(user, role)) {
    forbidden(); // 403 — no role requested, or none of them held
  }
  return <>{children}</>;
}
