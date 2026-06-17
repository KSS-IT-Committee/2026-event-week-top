import { forbidden, unauthorized } from "next/navigation";

import { hasAccess, type Role } from "@/lib/access";
import { getCurrentUser } from "@/lib/session";
import { isInternal } from "@/lib/user-category";

export async function AuthGuard({
  children,
  role,
  classCode,
}: {
  children: React.ReactNode;
  role?: Role | Role[];
  classCode?: string | string[];
}) {
  const user = await getCurrentUser();
  if (!user) {
    unauthorized(); // 401 — not logged in
  }

  // No role/class requested: gate on being an internal (school) user.
  if (role === undefined && classCode === undefined) {
    if (!isInternal(user.username)) {
      forbidden(); // 403
    }
    return <>{children}</>;
  }

  // A constraint was requested: admit the user if they match any of them
  // (role OR class). Nest guards when ALL must hold.
  if (!(await hasAccess(user.username, role, classCode))) {
    forbidden(); // 403
  }
  return <>{children}</>;
}
