import { desc, eq, inArray } from "drizzle-orm";
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

  // Choose the announcements first, so both the class filter and the limit run
  // in SQL. They can't be folded into the join below: that join expands one
  // announcement into one row per class it targets, so a LIMIT there would cut
  // an announcement's classes in half rather than cap the announcement count.
  //
  // Scoping to the class: only announcements explicitly targeting it. A
  // class-less announcement is NOT treated as global here — sousakuten-info
  // (which owns and writes announcements) inner-joins the link table and never
  // surfaces a class-less row, so this keeps both apps in agreement.
  const selected = await (
    className
      ? db
          .selectDistinct({
            id: announcements.id,
            createdAt: announcements.createdAt,
          })
          .from(announcements)
          .innerJoin(
            announcementClasses,
            eq(announcementClasses.announcementId, announcements.id),
          )
          .where(eq(announcementClasses.className, className))
      : db
          .select({
            id: announcements.id,
            createdAt: announcements.createdAt,
          })
          .from(announcements)
  )
    .orderBy(desc(announcements.createdAt))
    .limit(limit);

  if (selected.length === 0) return [];

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
    .where(
      inArray(
        announcements.id,
        selected.map((row) => row.id),
      ),
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

  return [...byId.values()];
}
