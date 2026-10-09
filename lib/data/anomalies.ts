import { and, desc, eq, getTableColumns, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/lib/db/client";
import { anomalies, anomalyExplanations, invoices, suppliers } from "@/lib/db/schema";
import type { AnomalyDetail, AnomalyListItem, AnomalyStatus } from "@/lib/schemas";
import type { AnomalyFilters } from "@/lib/types/dashboard";
import { clearAggregateCache } from "./sql";

/**
 * Data seam for Page 2 (PLAN-07), backed by the SQLite `anomalies` table populated by
 * `npm run anomalies:batch -- --source db --persist`. Shapes are the contract in lib/schemas/api.ts.
 */

const PRIORITY_RANK = sql`case ${anomalies.priority} when 'High' then 0 when 'Medium' then 1 else 2 end`;

function whereFor(f: AnomalyFilters): SQL | undefined {
  const q = f.q?.trim();
  const conditions = [
    q
      ? or(
          like(invoices.invoice_id, `%${q}%`),
          like(invoices.invoice_number, `%${q}%`),
          like(suppliers.supplier_name, `%${q}%`),
          like(anomalies.category, `%${q}%`),
        )
      : undefined,
    f.category ? eq(anomalies.category, f.category) : undefined,
    f.priority ? eq(anomalies.priority, f.priority) : undefined,
    f.status ? eq(anomalies.status, f.status) : undefined,
    f.supplier_id ? eq(invoices.supplier_id, f.supplier_id) : undefined,
    f.from ? gte(invoices.invoice_date, f.from) : undefined,
    f.to ? lte(invoices.invoice_date, f.to) : undefined,
  ];
  return and(...conditions);
}

function listQuery() {
  return getDb()
    .select({
      ...getTableColumns(anomalies),
      invoice_number: invoices.invoice_number,
      invoice_date: invoices.invoice_date,
      amount_usd: invoices.amount_usd,
      supplier_id: suppliers.supplier_id,
      supplier_name: suppliers.supplier_name,
      has_explanation: sql`${anomalyExplanations.anomaly_id} is not null`.mapWith(Boolean),
    })
    .from(anomalies)
    .innerJoin(invoices, eq(invoices.invoice_id, anomalies.invoice_id))
    .innerJoin(suppliers, eq(suppliers.supplier_id, invoices.supplier_id))
    .leftJoin(anomalyExplanations, eq(anomalyExplanations.anomaly_id, anomalies.anomaly_id));
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  /** Cap rows per category (highest priority/amount first) so every category is represented. */
  perCategory?: number;
}

export async function listAnomalies(filters: AnomalyFilters = {}, opts: ListOptions = {}): Promise<AnomalyListItem[]> {
  await connection();
  let where = whereFor(filters);

  if (opts.perCategory) {
    const ranked = getDb()
      .select({
        id: anomalies.anomaly_id,
        rn: sql<number>`row_number() over (partition by ${anomalies.category} order by ${PRIORITY_RANK}, ${invoices.amount_usd} desc)`.as("rn"),
      })
      .from(anomalies)
      .innerJoin(invoices, eq(invoices.invoice_id, anomalies.invoice_id))
      .innerJoin(suppliers, eq(suppliers.supplier_id, invoices.supplier_id))
      .where(where)
      .as("ranked");
    const ids = (await getDb().select({ id: ranked.id }).from(ranked).where(lte(ranked.rn, opts.perCategory))).map((r) => r.id);
    where = inArray(anomalies.anomaly_id, ids);
  }

  return listQuery()
    .where(where)
    .orderBy(PRIORITY_RANK, desc(invoices.invoice_date), anomalies.anomaly_id)
    .limit(opts.limit ?? -1)
    .offset(opts.offset ?? 0);
}

export async function countAnomalies(filters: AnomalyFilters = {}): Promise<number> {
  await connection();
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(anomalies)
    .innerJoin(invoices, eq(invoices.invoice_id, anomalies.invoice_id))
    .innerJoin(suppliers, eq(suppliers.supplier_id, invoices.supplier_id))
    .where(whereFor(filters));
  return row.n;
}

export async function getAnomalyDetail(anomalyId: string): Promise<AnomalyDetail | null> {
  await connection();
  const [row] = await getDb()
    .select({ anomaly: anomalies, invoice: invoices, supplier: suppliers, explanation: anomalyExplanations })
    .from(anomalies)
    .innerJoin(invoices, eq(invoices.invoice_id, anomalies.invoice_id))
    .innerJoin(suppliers, eq(suppliers.supplier_id, invoices.supplier_id))
    .leftJoin(anomalyExplanations, eq(anomalyExplanations.anomaly_id, anomalies.anomaly_id))
    .where(eq(anomalies.anomaly_id, anomalyId))
    .limit(1);
  return row ?? null;
}

export async function updateAnomalyStatus(anomalyId: string, status: AnomalyStatus): Promise<AnomalyDetail | null> {
  await getDb().update(anomalies).set({ status }).where(eq(anomalies.anomaly_id, anomalyId));
  clearAggregateCache();
  return getAnomalyDetail(anomalyId);
}
