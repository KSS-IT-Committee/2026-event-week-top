import type { ReactNode } from "react";
export async function TimeGuard({
  children,
  start,
  end,
  fallback = null,
}: {
  children: ReactNode;
  start?: string | null;
  end?: string | null;
  fallback?: ReactNode;
}) {
  const startAt = start ? parseBound(start, "start") : null;
  const endAt = end ? parseBound(end, "end") : null;

  const now = new Date();
  if (startAt && now < startAt) {
    return <>{fallback}</>;
  }

  if (endAt && now > endAt) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

function parseBound(value: string, name: "start" | "end"): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `TimeGuard: \`${name}\` is not a valid date string: ${JSON.stringify(value)}`,
    );
  }
  return parsed;
}
