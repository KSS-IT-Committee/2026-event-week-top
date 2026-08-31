import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

// Local copy of the tables this app queries. The canonical schema (and the
// only thing that migrates the shared `appdata` database) is 2026-db —
// mirror any change there and keep it additive.

// Login credentials, loaded out-of-band from 2026-account-generator's
// users.sql.
export const ROLENAMES = [
  // Committee roles — granted by hand (SQL UPDATE) to individual accounts.
  "IT",
  "Sousakuten",
  "Taiikusai",
  // Population roles — every roster account carries them via
  // 2026-account-generator's users.sql: students get G<grade> + Class<letter>
  // + Students, staff accounts get Teachers. AuthGuard/Internal gate on these
  // instead of username patterns. Append-only: Postgres enums cannot drop or
  // reorder values, so new roles go at the end.
  "G1",
  "G2",
  "G3",
  "G4",
  "G5",
  "G6",
  "ClassA",
  "ClassB",
  "ClassC",
  "ClassD",
  "Students",
  "Teachers",
  "Geinousai",
] as const;
export const roleEnum = pgEnum("role", ROLENAMES);

export const performanceEnum = pgEnum("performance", ["A", "B", "C", "D", "E"]);

export const users = pgTable("users", {
  username: varchar("username", { length: 32 }).primaryKey(),
  passwordHash: varchar("password_hash", { length: 60 }).notNull(),
  // Latches true on the account's first successful login and never goes back
  // to false. Lets us tell which accounts have ever been used.
  hasLoggedIn: boolean("has_logged_in").notNull().default(false),
  roles: roleEnum("roles")
    .array()
    .notNull()
    .default(sql`'{}'`),
});

// Login sessions, shared by every *.2026 app. The browser cookie holds a
// random token; `id` is the SHA-256 hex of that token, so a leaked table
// dump cannot be replayed as a cookie. Expiry slides on access: apps renew
// `expires_at` to now + TTL (default 2 days) when they validate a session.
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    username: varchar("username", { length: 32 })
      .notNull()
      .references(() => users.username, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sessions_username_idx").on(table.username),
    index("sessions_expires_at_idx").on(table.expiresAt),
    // Belt-and-braces: `id` must be a lowercase SHA-256 hex digest (what the
    // apps store). Rejects a raw token accidentally inserted as the id, which
    // would otherwise be a replayable cookie value.
    check("session_id_is_sha256_hex", sql`${table.id} ~ '^[0-9a-f]{64}$'`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

/* ──────────────── viewing lottery (owned by this app) ────────────────
 *
 * This app is the only writer. Lottery definitions (slots, acts,
 * eligibility, windows) are code in lib/lotteries.ts, not rows — adding a
 * future lottery only introduces new `lottery_id` values, no schema change.
 */

// Who a lottery entry applies for: the account holder themselves ("student"
// — staff accounts entering a staff-open lottery also use it), or the
// student's parents/guardians (who log in with the student's account).
export const LOTTERY_APPLICANT_TYPES = ["student", "parent"] as const;

export const lotteryApplicantTypeEnum = pgEnum(
  "lottery_applicant_type",
  LOTTERY_APPLICANT_TYPES,
);

export type LotteryApplicantType = (typeof LOTTERY_APPLICANT_TYPES)[number];

export function isLotteryApplicantType(
  value: string,
): value is LotteryApplicantType {
  return (LOTTERY_APPLICANT_TYPES as readonly string[]).includes(value);
}

// 公演観覧抽選 希望DB — one row per (lottery, slot, account, applicant type):
// the ranked act preferences one applicant submitted for one performance
// slot. Mirrored verbatim in 2026-db (the sole migrator).
export const lotteryEntries = pgTable(
  "lottery_entries",
  {
    id: serial("id").primaryKey(),
    lotteryId: varchar("lottery_id", { length: 64 }).notNull(),
    slotId: varchar("slot_id", { length: 64 }).notNull(),
    // Parents apply through their child's student account, so this is the
    // child's username for `parent` entries too.
    username: varchar("username", { length: 32 })
      .notNull()
      .references(() => users.username, { onDelete: "cascade" }),
    applicantType: lotteryApplicantTypeEnum("applicant_type").notNull(),
    // Ranked choices among the lottery's act ids (class codes today). The app
    // validates them against its lottery definition before writing.
    firstChoice: varchar("first_choice", { length: 64 }).notNull(),
    secondChoice: varchar("second_choice", { length: 64 }),
    thirdChoice: varchar("third_choice", { length: 64 }),
    // 観覧人数 — seats this entry claims if drawn (保護者 entries may bring
    // up to 2 people; 本人 entries are always 1). The exact per-applicant
    // maximum is app policy (lib/lotteries.ts); the DB only sanity-checks
    // positivity.
    partySize: integer("party_size").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One submission per slot per account per applicant type; resubmitting
    // replaces it. Doubles as the draw-time (lottery, slot) scan index.
    unique("lottery_entries_slot_applicant_unique").on(
      table.lotteryId,
      table.slotId,
      table.username,
      table.applicantType,
    ),
    index("lottery_entries_username_idx").on(table.username),
    check("party_size_positive", sql`${table.partySize} >= 1`),
    // Ranks fill top-down: no third choice without a second.
    check(
      "choice_ranks_fill_top_down",
      sql`${table.thirdChoice} IS NULL OR ${table.secondChoice} IS NOT NULL`,
    ),
    // A slot's choices never repeat an act.
    check(
      "choices_are_distinct",
      sql`${table.secondChoice} IS DISTINCT FROM ${table.firstChoice} AND ${table.thirdChoice} IS DISTINCT FROM ${table.firstChoice} AND (${table.thirdChoice} IS NULL OR ${table.secondChoice} IS NULL OR ${table.thirdChoice} <> ${table.secondChoice})`,
    ),
  ],
);

export type LotteryEntry = typeof lotteryEntries.$inferSelect;
export type NewLotteryEntry = typeof lotteryEntries.$inferInsert;

/* ─────────────── read-only mirrors for the /chat assistant ───────────────
 *
 * These tables are owned and written by sousakuten-info + equipment-management
 * and already exist in `appdata` (created by 2026-db migrations). They are
 * mirrored here verbatim ONLY so the chat tools can READ them with Drizzle
 * types. This app never writes them and never migrates — keep these identical
 * to 2026-db/db/schema.ts. The class list must stay in lockstep with the
 * canonical CLASSNAMES (and the other apps' copies).
 */

// 学年+組 (1A..6D). Lockstep with 2026-db's canonical pgEnum.
export const CLASSNAMES = [
  "1A",
  "1B",
  "1C",
  "1D",
  "2A",
  "2B",
  "2C",
  "2D",
  "3A",
  "3B",
  "3C",
  "3D",
  "4A",
  "4B",
  "4C",
  "4D",
  "5A",
  "5B",
  "5C",
  "5D",
  "6A",
  "6B",
  "6C",
  "6D",
] as const;

export const classEnum = pgEnum("class_name", CLASSNAMES);

export type ClassName = (typeof CLASSNAMES)[number];

export function isClassName(value: string): value is ClassName {
  return (CLASSNAMES as readonly string[]).includes(value);
}

// 減点クラスDB — per-class deductions.
export const deductions = pgTable("deductions", {
  id: serial("id").primaryKey(),
  className: classEnum("class_name").notNull(),
  content: text("content").notNull(),
  points: integer("points").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 伝達内容DB — announcement bodies.
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 伝達クラスDB — junction linking announcements to the classes they target.
export const announcementClasses = pgTable(
  "announcement_classes",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    className: classEnum("class_name").notNull(),
  },
  (table) => [unique().on(table.announcementId, table.className)],
);

// 備品DB
export const Equipments = pgTable(
  "equipments",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    picture: text("picture"),
  },
  (table) => [check("quantity_positive", sql`${table.quantity} > 0`)],
);

// 備品貸出DB
export const Borrowings = pgTable(
  "borrowings",
  {
    id: serial("id").primaryKey(),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => Equipments.id),
    class: classEnum("class").notNull(),
    borrowedAt: timestamp("borrowed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
  },
  (table) => [
    index("equipment_idx").on(table.equipmentId),
    index("class_idx").on(table.class),
    check(
      "returned_at_after_borrowed_at",
      sql`${table.returnedAt} IS NULL OR ${table.returnedAt} >= ${table.borrowedAt}`,
    ),
  ],
);

// 芸能祭座席DB
export const Seats = pgTable(
  "seats",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 32 })
      .notNull()
      .references(() => users.username, { onDelete: "cascade" }),
    performance: performanceEnum("performance").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    seat: text("seat").notNull(),
  },
  (table) => [
    unique("seats_username_performance_unique").on(
      table.username,
      table.performance,
    ),
  ],
);
