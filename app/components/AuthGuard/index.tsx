import { eq } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { ROLENAMES, users } from "@/db/schema";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Role = (typeof ROLENAMES)[number];

export async function AuthGuard({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: Role | Role[];
}) {
  const user = await getCurrentUser();
  if (!user) {
    forbidden();
  }

  // Authenticated but missing the required role → 403. Without `role`, any
  // logged-in user passes.
  if (role !== undefined) {
    const required = Array.isArray(role) ? role : [role];
    const [row] = await db
      .select({ roles: users.roles })
      .from(users)
      .where(eq(users.username, user.username));
    const userRoles = row?.roles ?? [];
    if (!required.some((r) => userRoles.includes(r))) {
      forbidden();
    }
  }

  return <>{children}</>;
}
