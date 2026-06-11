import { index, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Local copy of the tables this app queries. The canonical schema (and the
// only thing that migrates the shared `appdata` database) is 2026-db —
// mirror any change there and keep it additive.

// Login credentials, loaded out-of-band from 2026-account-generator's
// users.sql.
export const users = pgTable("users", {
  username: varchar("username", { length: 32 }).primaryKey(),
  passwordHash: varchar("password_hash", { length: 60 }).notNull(),
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
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
