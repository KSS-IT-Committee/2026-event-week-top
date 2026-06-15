import { eq } from "drizzle-orm";
import { forbidden, unauthorized } from "next/navigation";

import { ROLENAMES, users } from "@/db/schema";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

type Role = (typeof ROLENAMES)[number];

// Mirrors lib/user-category.ts (which lives on the Internal-component branch).
// Inlined here so this guard stays self-contained; DRY it up once
// user-category.ts is on main.
const STUDENT_RE = /^[1-6][A-D]\d{2}$/; // 1A01 … 6D40
const TEACHER_RE = /^k/; // k-prefixed staff accounts

function isInternal(username: string): boolean {
  return STUDENT_RE.test(username) || TEACHER_RE.test(username);
}

export async function AuthGuard({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: Role | Role[];
}) {
  const user = await getCurrentUser();
  if (!user) {
    unauthorized(); // 401 — not logged in
  }

  if (role === undefined) {
    // No role requested: gate on being an internal (school) user.
    if (!isInternal(user.username)) {
      forbidden(); // 403
    }
  } else {
    // Role requested: the user must hold (one of) it.
    const required = Array.isArray(role) ? role : [role];
    const [row] = await db
      .select({ roles: users.roles })
      .from(users)
      .where(eq(users.username, user.username));
    const userRoles = row?.roles ?? [];
    if (!required.some((r) => userRoles.includes(r))) {
      forbidden(); // 403
    }
  }

  return <>{children}</>;
}
