import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";

import {
  announcementClasses,
  announcements,
  type ClassName,
} from "@/db/schema";
import { db } from "@/lib/db";

export type AnnouncementSummary = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  classes: string[];
};

/**
 * Recent announcements with the classes each one targets. When `className` is
 * given, only announcements targeting that class are returned. Read-only:
 * announcements are owned/written by sousakuten-info; here we only query.
 */
export async function getAnnouncements(
  className?: ClassName,
  limit = 20,
): Promise<AnnouncementSummary[]> {
  await connection();

  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      body: announcements.body,
      createdAt: announcements.createdAt,
      className: announcementClasses.className,
    })
    .from(announcements)
    .leftJoin(
      announcementClasses,
      eq(announcementClasses.announcementId, announcements.id),
    )
    .orderBy(desc(announcements.createdAt));

  // Collapse the join back into one row per announcement, preserving the
  // createdAt-desc order from the query.
  const byId = new Map<number, AnnouncementSummary>();
  for (const row of rows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        classes: [],
      };
      byId.set(row.id, entry);
    }
    if (row.className) entry.classes.push(row.className);
  }

  let list = [...byId.values()];
  if (className) list = list.filter((a) => a.classes.includes(className));
  return list.slice(0, limit);
}
