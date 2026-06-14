import { getUserByUsername } from "@/db/getUserByUsername";
import { ROLENAMES } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { isInternal } from "@/lib/user-category";

type Role = (typeof ROLENAMES)[number];

export async function Internal({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: Role | Role[];
}) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.username)) {
    return null;
  }

  // When a role is requested, the user must hold (one of) it on top of being
  // internal. Without the prop, any internal user passes.
  if (role !== undefined) {
    const required = Array.isArray(role) ? role : [role];
    const fullUser = await getUserByUsername(user.username);
    const userRoles = fullUser?.roles ?? [];
    if (!required.some((r) => userRoles.includes(r))) {
      return null;
    }
  }

  return <>{children}</>;
}
