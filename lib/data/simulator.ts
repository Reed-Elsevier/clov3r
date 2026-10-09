import { sql } from "drizzle-orm";

import type { SimulatorBaseline } from "@/lib/types/dashboard";
import { cachedAggregate, HAS_EXCEPTION, lastMonths, pct, query, round1 } from "./sql";

const WINDOW_MONTHS = 12;

/** Monthly baseline from the latest 12 months of data. */
export function getSimulatorBaseline(): Promise<SimulatorBaseline> {
  return cachedAggregate("simulator", computeBaseline);
}

async function computeBaseline(): Promise<SimulatorBaseline> {
  const months = await lastMonths(WINDOW_MONTHS);
  const from = `${months[0] ?? "0000-00"}-01`;

  const [[inv], [exc], [processing]] = await Promise.all([
    query<{ invoices: number; with_exc: number }>(sql`
      select count(*) as invoices, coalesce(sum(${HAS_EXCEPTION}), 0) as with_exc
      from invoices i where i.invoice_date >= ${from}`),
    query<{ total: number; missing_po: number }>(sql`
      select count(*) as total, coalesce(sum(e.exception_type = 'Missing PO'), 0) as missing_po
      from invoice_exceptions e join invoices i on i.invoice_id = e.invoice_id where i.invoice_date >= ${from}`),
    query<{ avg_days: number | null }>(sql`
      select avg(julianday(p.first_paid_at) - julianday(i.received_at)) as avg_days
      from invoices i
      join (select invoice_id, min(paid_at) as first_paid_at from payments group by invoice_id) p on p.invoice_id = i.invoice_id
      where i.invoice_date >= ${from}`),
  ]);
  const n = Math.max(months.length, 1);

  return {
    meta: { source: "live", generatedAt: new Date().toISOString() },
    monthlyInvoices: Math.round(inv.invoices / n),
    exceptionRate: pct(inv.with_exc, inv.invoices),
    missingFieldExceptionsPerMonth: Math.round(exc.missing_po / n),
    avgProcessingDays: round1(processing.avg_days ?? 0),
    manualReviewsPerMonth: Math.round(exc.total / n),
    // Not in the dataset (raised/resolved times are elapsed, not hands-on effort): planning assumptions.
    avgReviewMinutes: 38,
    reviewCostPerHourUsd: 45,
  };
}
