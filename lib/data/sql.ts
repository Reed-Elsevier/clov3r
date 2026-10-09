import { sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/lib/db/client";

/** Shared SQL helpers for the dashboard seams in lib/data. */

export async function query<T>(q: SQL): Promise<T[]> {
  await connection();
  return getDb().all<T>(q);
}

const AGGREGATE_TTL_MS = 60_000;
const aggregateCache = new Map<string, { expires: number; value: Promise<unknown> }>();

/** Dashboard aggregates scan every invoice, so reuse results for a minute across requests. */
export async function cachedAggregate<T>(key: string, compute: () => Promise<T>): Promise<T> {
  await connection();
  const hit = aggregateCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = compute();
  aggregateCache.set(key, { expires: Date.now() + AGGREGATE_TTL_MS, value });
  value.catch(() => aggregateCache.delete(key));
  return value;
}

/** Drops cached aggregates, e.g. after a reviewer changes an anomaly's status. */
export function clearAggregateCache() {
  aggregateCache.clear();
}

/** Invoice `i` has an anomaly still awaiting a human decision. */
export const FLAGGED = sql`exists (select 1 from anomalies a where a.invoice_id = i.invoice_id and a.status in ('Needs review', 'Investigating'))`;

/** Invoice `i` has at least one upstream invoice_exceptions row. */
export const HAS_EXCEPTION = sql`exists (select 1 from invoice_exceptions e where e.invoice_id = i.invoice_id)`;

/** Joins invoice `i` to its department (every invoice's lines share one cost center). */
export const JOIN_DEPARTMENT = sql`join invoice_lines l on l.invoice_id = i.invoice_id and l.line_no = 1
  join cost_centers cc on cc.cost_center_id = l.cost_center_id`;

/** The last `n` YYYY-MM months that have invoices, oldest first. Anchored on the data, not the clock. */
export async function lastMonths(n: number): Promise<string[]> {
  const rows = await query<{ month: string }>(
    sql`select distinct substr(invoice_date, 1, 7) as month from invoices order by month desc limit ${n}`,
  );
  return rows.map((r) => r.month).reverse();
}

/** department_id -> department_name from the A_workforce `departments` table, when loaded. */
export async function departmentNames(): Promise<Map<string, string>> {
  const [exists] = await query<{ n: number }>(sql`select count(*) as n from sqlite_master where type = 'table' and name = 'departments'`);
  if (!exists?.n) return new Map();
  const rows = await query<{ department_id: string; department_name: string }>(
    sql`select department_id, department_name from departments`,
  );
  return new Map(rows.map((r) => [r.department_id, r.department_name]));
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const pct = (part: number, total: number) => (total ? round1((part / total) * 100) : 0);
