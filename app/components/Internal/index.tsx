import { hasAccess, type Role } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";
import { isInternal } from "@/lib/user-category";

export async function Internal({
  children,
  role,
  classCode,
}: {
  children: React.ReactNode;
  role?: Role | Role[];
  classCode?: string | string[];
}) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.username)) {
    return null;
  }

  // No further constraint: any internal user passes.
  if (role === undefined && classCode === undefined) {
    return <>{children}</>;
  }

  // Otherwise the user must also match a requested role or class.
  if (hasAccess(user, role, classCode)) {
    return <>{children}</>;
  }
  return null;
}
