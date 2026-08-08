export async function TimeGuard({
  children,
  start,
  end,
  fallback = null,
}: {
import type { ReactNode } from "react";

  children: ReactNode;
  start?: string;
  end?: string;
  fallback?: ReactNode;
}) {
  const now = new Date();
  if (start && now < new Date(start)) {
    return <>{fallback}</>;
  }

  if (end && now > new Date(end)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
