import { mkdirSync } from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type Database = BetterSQLite3Database<typeof schema> & { $client: BetterSqlite3.Database };

// Cached on globalThis so Next.js dev hot-reloads don't reopen the file each time.
const globalForDb = globalThis as unknown as { __invoiceiqDb?: Database };

/** SQLite file path: `DATABASE_PATH`, defaulting to `data/clov3r.db`. */
export function databasePath(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATABASE_PATH || "data/clov3r.db");
}

/**
 * Returns the shared Drizzle client (created on first use).
 *
 * Next.js loads `.env*` files itself; standalone scripts should
 * `import "@/lib/db/load-env"` (or a relative path) first. Initialization is
 * lazy so importing this module never touches the database file.
 */
export function getDb(): Database {
  if (globalForDb.__invoiceiqDb) return globalForDb.__invoiceiqDb;

  const file = databasePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const client = new BetterSqlite3(file);
  client.pragma("journal_mode = WAL");
  client.pragma("foreign_keys = ON");
  const db = drizzle({ client, schema });
  globalForDb.__invoiceiqDb = db;
  return db;
}

/** Closes the shared connection. Intended for CLI scripts; not needed inside Next.js. */
export async function closeDb(): Promise<void> {
  const db = globalForDb.__invoiceiqDb;
  if (!db) return;
  globalForDb.__invoiceiqDb = undefined;
  db.$client.close();
}

export { schema };
