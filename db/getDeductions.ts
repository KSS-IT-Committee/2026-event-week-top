import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import { type ClassName, deductions } from "@/db/schema";
import { db } from "@/lib/db";

export type DeductionSummary = {
  id: number;
  className: string;
  content: string;
  points: number;
  occurredAt: string;
};

/**
 * Recent deductions, optionally filtered to one class. Read-only — deductions
 * are owned/written by sousakuten-info + equipment-management.
 */
export async function getDeductions(
  className?: ClassName,
  limit = 50,
): Promise<DeductionSummary[]> {
  await connection();

  const rows = await db
    .select()
    .from(deductions)
    .where(className ? eq(deductions.className, className) : undefined)
    .orderBy(desc(deductions.occurredAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    className: row.className,
    content: row.content,
    points: row.points,
    occurredAt: row.occurredAt.toISOString(),
  }));
}
