import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

// Cached on globalThis so Next.js dev hot-reloads don't open a new pool each time.
const globalForDb = globalThis as unknown as { __invoiceiqDb?: Database };

/**
 * Returns the shared Drizzle client (created on first use).
 *
 * Reads `DATABASE_URL`. Next.js loads `.env*` files itself; standalone
 * scripts should `import "@/lib/db/load-env"` (or a relative path) first.
 * Initialization is lazy so importing this module never requires a database
 * (e.g. during `next build`).
 */
export function getDb(): Database {
  if (globalForDb.__invoiceiqDb) return globalForDb.__invoiceiqDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and configure it.",
    );
  }

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  globalForDb.__invoiceiqDb = db;
  return db;
}

/** Closes the shared pool. Intended for CLI scripts; not needed inside Next.js. */
export async function closeDb(): Promise<void> {
  const db = globalForDb.__invoiceiqDb;
  if (!db) return;
  globalForDb.__invoiceiqDb = undefined;
  await db.$client.end();
}

export { schema };
