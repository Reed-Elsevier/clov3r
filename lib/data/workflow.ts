import { sql } from "drizzle-orm";

import type { InvoiceExceptionType, SupplierCategory, SupplierRiskTier } from "@/lib/schemas";
import type { ReviewTimeByType, WorkflowInsights } from "@/lib/types/dashboard";
import { cachedAggregate, departmentNames, HAS_EXCEPTION, JOIN_DEPARTMENT, lastMonths, pct, query, round1 } from "./sql";

const TOP_DEPARTMENTS = 10;
const TOP_SUPPLIERS = 10;
/** Suppliers with fewer invoices are too small for a meaningful exception rate. */
const MIN_SUPPLIER_INVOICES = 20;

export function getWorkflowInsights(): Promise<WorkflowInsights> {
  return cachedAggregate("workflow", computeWorkflowInsights);
}

async function computeWorkflowInsights(): Promise<WorkflowInsights> {
  const [departments, names, suppliers, reviewHours, payments, backlog, months] = await Promise.all([
    query<{ department_id: string; invoices: number; exceptions: number }>(sql`
      select cc.department_id, count(*) as invoices, sum(${HAS_EXCEPTION}) as exceptions
      from invoices i ${JOIN_DEPARTMENT} group by 1`),
    departmentNames(),
    query<{ supplier_id: string; supplier_name: string; category: SupplierCategory; risk_tier: SupplierRiskTier; invoices: number; exceptions: number }>(sql`
      select s.supplier_id, s.supplier_name, s.category, s.risk_tier, count(*) as invoices, sum(${HAS_EXCEPTION}) as exceptions
      from invoices i join suppliers s on s.supplier_id = i.supplier_id
      group by s.supplier_id having count(*) >= ${MIN_SUPPLIER_INVOICES}
      order by 1.0 * sum(${HAS_EXCEPTION}) / count(*) desc limit ${TOP_SUPPLIERS}`),
    query<{ exception_type: InvoiceExceptionType; hours: number }>(sql`
      select exception_type, (julianday(resolved_at) - julianday(raised_at)) * 24 as hours
      from invoice_exceptions where resolved_at is not null`),
    query<{ month: string; avg_days: number }>(sql`
      select substr(paid_at, 1, 7) as month, avg(days_vs_due) as avg_days from payments group by 1`),
    query<{ month: string; open: number; resolved: number }>(sql`
      select substr(raised_at, 1, 7) as month, sum(resolved_at is null) as open, sum(resolved_at is not null) as resolved
      from invoice_exceptions group by 1`),
    lastMonths(12),
  ]);

  const supplierIds = suppliers.map((s) => s.supplier_id);
  const supplierTypes = supplierIds.length
    ? await query<{ supplier_id: string; exception_type: InvoiceExceptionType; n: number }>(sql`
        select i.supplier_id, e.exception_type, count(*) as n
        from invoice_exceptions e join invoices i on i.invoice_id = e.invoice_id
        where i.supplier_id in ${supplierIds} group by 1, 2 order by 3 desc`)
    : [];
  const topType = new Map<string, InvoiceExceptionType>();
  for (const t of supplierTypes) if (!topType.has(t.supplier_id)) topType.set(t.supplier_id, t.exception_type);

  const paymentsByMonth = new Map(payments.map((p) => [p.month, p.avg_days]));
  const backlogByMonth = new Map(backlog.map((b) => [b.month, b]));

  return {
    meta: { source: "live", generatedAt: new Date().toISOString() },
    byDepartment: departments
      .map((d) => ({
        departmentId: d.department_id,
        departmentName: names.get(d.department_id) ?? d.department_id,
        invoices: d.invoices,
        exceptions: d.exceptions,
        exceptionRate: pct(d.exceptions, d.invoices),
      }))
      .sort((a, b) => b.exceptionRate - a.exceptionRate)
      .slice(0, TOP_DEPARTMENTS),
    bySupplier: suppliers
      .filter((s) => topType.has(s.supplier_id))
      .map((s) => ({
        supplierId: s.supplier_id,
        supplierName: s.supplier_name,
        category: s.category,
        riskTier: s.risk_tier,
        invoices: s.invoices,
        exceptions: s.exceptions,
        exceptionRate: pct(s.exceptions, s.invoices),
        topExceptionType: topType.get(s.supplier_id)!,
      })),
    reviewTimeByType: summarizeReviewHours(reviewHours),
    delayTrend: months.map((month) => ({
      month,
      avgDaysVsDue: round1(paymentsByMonth.get(month) ?? 0),
      openExceptions: backlogByMonth.get(month)?.open ?? 0,
      resolvedExceptions: backlogByMonth.get(month)?.resolved ?? 0,
    })),
  };
}

function summarizeReviewHours(rows: { exception_type: InvoiceExceptionType; hours: number }[]): ReviewTimeByType[] {
  const byType = new Map<InvoiceExceptionType, number[]>();
  for (const r of rows) {
    const list = byType.get(r.exception_type);
    if (list) list.push(r.hours);
    else byType.set(r.exception_type, [r.hours]);
  }
  const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

  return [...byType.entries()]
    .map(([exceptionType, hours]) => {
      const sorted = hours.sort((a, b) => a - b);
      return {
        exceptionType,
        count: sorted.length,
        medianHours: round1(quantile(sorted, 0.5)),
        p90Hours: round1(quantile(sorted, 0.9)),
        totalHours: Math.round(sorted.reduce((s, h) => s + h, 0)),
      };
    })
    .sort((a, b) => b.medianHours - a.medianHours);
}
