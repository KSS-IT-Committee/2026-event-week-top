import { pgTable, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  username: varchar("username", { length: 8 }).primaryKey(),
  passwordHash: varchar("password_hash", { length: 60 }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
