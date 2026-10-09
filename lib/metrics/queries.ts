import { and, desc, eq, exists, gte, lte, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { anomalies, invoiceExceptions, invoiceLines, invoices } from "@/lib/db/schema";
import {
  PUBLISHED_BASELINES,
  type InvoiceListQuery,
  type InvoiceListResponse,
  type MetricsResponse,
} from "@/lib/schemas";

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, total: number) => (total ? round2((part / total) * 100) : 0);

/** Headline KPIs computed live from Postgres (PLAN-02 §3). */
export async function getMetrics(): Promise<MetricsResponse> {
  const db = getDb();

  const [[inv], [exc], processing, [anom]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        withoutPo: sql<number>`(count(*) filter (where ${invoices.po_id} is null))::int`,
      })
      .from(invoices),
    db
      .select({
        invoicesWithExceptions: sql<number>`count(distinct ${invoiceExceptions.invoice_id})::int`,
        open: sql<number>`(count(*) filter (where ${invoiceExceptions.resolved_at} is null))::int`,
      })
      .from(invoiceExceptions),
    db.execute<{ avg_days: number | null }>(sql`
      select avg(extract(epoch from (p.first_paid_at - i.received_at)) / 86400)::float8 as avg_days
      from invoices i
      join (select invoice_id, min(paid_at) as first_paid_at from payments group by invoice_id) p
        on p.invoice_id = i.invoice_id
    `),
    db
      .select({
        total: sql<number>`count(*)::int`,
        high: sql<number>`(count(*) filter (where ${anomalies.priority} = 'High'))::int`,
        flaggedValue: sql<number>`coalesce((
          select sum(i.amount_usd) from invoices i
          where exists (
            select 1 from anomalies a
            where a.invoice_id = i.invoice_id and a.status in ('Needs review', 'Investigating')
          )
        ), 0)::float8`,
      })
      .from(anomalies),
  ]);

  const avgDays = processing.rows[0]?.avg_days;

  return {
    total_invoices: inv.total,
    invoices_with_exceptions: exc.invoicesWithExceptions,
    exception_rate_pct: pct(exc.invoicesWithExceptions, inv.total),
    invoices_without_po: inv.withoutPo,
    invoices_without_po_pct: pct(inv.withoutPo, inv.total),
    open_exceptions: exc.open,
    avg_processing_days: avgDays === null || avgDays === undefined ? null : round2(avgDays),
    anomalies_detected: anom.total,
    high_priority_anomalies: anom.high,
    flagged_value_usd: round2(anom.flaggedValue),
    baselines: { ...PUBLISHED_BASELINES },
    generated_at: new Date().toISOString(),
  };
}

/** Paginated, filterable invoice list (PLAN-02 §3). */
export async function listInvoices(q: InvoiceListQuery): Promise<InvoiceListResponse> {
  const db = getDb();

  const conditions: SQL[] = [];
  if (q.supplier_id) conditions.push(eq(invoices.supplier_id, q.supplier_id));
  if (q.status) conditions.push(eq(invoices.status, q.status));
  if (q.from) conditions.push(gte(invoices.invoice_date, q.from));
  if (q.to) conditions.push(lte(invoices.invoice_date, q.to));
  if (q.cost_center_id) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(invoiceLines)
          .where(and(eq(invoiceLines.invoice_id, invoices.invoice_id), eq(invoiceLines.cost_center_id, q.cost_center_id))),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [{ total }]] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.invoice_date), desc(invoices.invoice_id))
      .limit(q.page_size)
      .offset((q.page - 1) * q.page_size),
    db.select({ total: sql<number>`count(*)::int` }).from(invoices).where(where),
  ]);

  return { items, page: q.page, page_size: q.page_size, total };
}
