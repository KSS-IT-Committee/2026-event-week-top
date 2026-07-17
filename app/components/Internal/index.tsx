import { hasAnyRole, type Role } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";

/**
 * Renders children only for a logged-in user who holds at least one of the
 * roles in `role`; everyone else gets nothing — the fragment leaves no trace
 * in the HTML.
 *
 * Deny-by-default: with no `role` prop it renders nothing for anybody.
 * Callers must state which roles may see the fragment —
 * `role={INTERNAL_ROLES}` for "any logged-in school account". Username
 * shapes are never consulted.
 */
export async function Internal({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: Role | readonly Role[];
}) {
  const user = await getCurrentUser();
  if (!user || role === undefined || !hasAnyRole(user, role)) {
    return null;
  }
  return <>{children}</>;
}
