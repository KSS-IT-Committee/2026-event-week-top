import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

declare global {
  // Reuse the pool across HMR reloads in dev to avoid leaking connections.
  var pgClient: ReturnType<typeof postgres> | undefined;
}

type Db = PostgresJsDatabase<typeof schema>;
let _db: Db | undefined;

function getDb(): Db {
  if (_db) return _db;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const client = global.pgClient ?? postgres(databaseUrl, { max: 10 });
  if (process.env.NODE_ENV !== "production") global.pgClient = client;
  _db = drizzle(client, { schema });
  return _db;
}

export const db = new Proxy({} as Db, {
  get: (_target, prop) => {
    const target = getDb();
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

// A Drizzle executor: either the shared `db` or a transaction handle yielded by
// `db.transaction(...)`. Query helpers accept this (defaulting to `db`) so a
// caller can compose several writes into one atomic transaction.
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
