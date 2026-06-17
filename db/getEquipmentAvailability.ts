import { eq, ilike, sql } from "drizzle-orm";
import { connection } from "next/server";

import { Borrowings, Equipments } from "@/db/schema";
import { db } from "@/lib/db";

export type EquipmentAvailability = {
  id: number;
  name: string;
  quantity: number;
  borrowed: number;
  available: number;
};

/**
 * Equipment stock with live availability: `available` = total quantity minus
 * the count of open borrowings (returnedAt IS NULL). Optional case-insensitive
 * substring filter on the name. Read-only — equipment + borrowings are owned by
 * equipment-management.
 */
export async function getEquipmentAvailability(
  name?: string,
  limit = 50,
): Promise<EquipmentAvailability[]> {
  await connection();

  const openBorrowings = sql<number>`count(${Borrowings.id}) filter (where ${Borrowings.returnedAt} is null)`;

  const rows = await db
    .select({
      id: Equipments.id,
      name: Equipments.name,
      quantity: Equipments.quantity,
      borrowed: openBorrowings.mapWith(Number),
    })
    .from(Equipments)
    .leftJoin(Borrowings, eq(Borrowings.equipmentId, Equipments.id))
    .where(name ? ilike(Equipments.name, `%${name}%`) : undefined)
    .groupBy(Equipments.id)
    .orderBy(Equipments.name)
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    available: row.quantity - row.borrowed,
  }));
}
