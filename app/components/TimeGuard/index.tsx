import type { ReactNode } from "react";
export async function TimeGuard({
  children,
  start,
  end,
  fallback = null,
}: {
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
