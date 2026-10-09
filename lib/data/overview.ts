import { sql } from "drizzle-orm";

import { PUBLISHED_BASELINES } from "@/lib/schemas";
import type { DepartmentFlaggedValue, KpiMetric, OverviewData } from "@/lib/types/dashboard";
import { cachedAggregate, departmentNames, FLAGGED, HAS_EXCEPTION, JOIN_DEPARTMENT, lastMonths, pct, query, round1 } from "./sql";

const TREND_MONTHS = 6;
const CHART_MONTHS = 12;

const AMOUNT_BUCKETS = ["<$1k", "$1k–5k", "$5k–10k", "$10k–25k", "$25k–50k", ">$50k"];

interface MonthRow {
  month: string;
  invoices: number;
  no_po: number;
  with_exc: number;
  flagged_value: number;
  anomalies: number;
  high: number;
}

/** Single seam between the Overview page and SQLite. KPI values are all-time; trends are the latest months. */
export function getOverviewData(): Promise<OverviewData> {
  return cachedAggregate("overview", computeOverview);
}

async function computeOverview(): Promise<OverviewData> {
  const [monthly, monthlyAnomalies, categories, buckets, recent] = await Promise.all([
    query<Omit<MonthRow, "anomalies" | "high">>(sql`
      select substr(i.invoice_date, 1, 7) as month, count(*) as invoices,
        sum(i.po_id is null) as no_po, sum(${HAS_EXCEPTION}) as with_exc,
        sum(case when ${FLAGGED} then i.amount_usd else 0 end) as flagged_value
      from invoices i group by 1 order by 1`),
    query<{ month: string; anomalies: number; high: number }>(sql`
      select substr(i.invoice_date, 1, 7) as month, count(*) as anomalies, sum(a.priority = 'High') as high
      from anomalies a join invoices i on i.invoice_id = a.invoice_id group by 1`),
    query<{ category: string; count: number }>(sql`
      select category, count(*) as count from anomalies group by 1 order by 2 desc`),
    query<{ bucket: number; normal: number; anomalous: number }>(sql`
      select case when amount_usd < 1000 then 0 when amount_usd < 5000 then 1 when amount_usd < 10000 then 2
                  when amount_usd < 25000 then 3 when amount_usd < 50000 then 4 else 5 end as bucket,
        sum(not flagged) as normal, sum(flagged) as anomalous
      from (select i.amount_usd, ${FLAGGED} as flagged from invoices i) group by 1 order by 1`),
    lastMonths(TREND_MONTHS),
  ]);

  const anomaliesByMonth = new Map(monthlyAnomalies.map((r) => [r.month, r]));
  const months: MonthRow[] = monthly.map((m) => ({
    ...m,
    anomalies: anomaliesByMonth.get(m.month)?.anomalies ?? 0,
    high: anomaliesByMonth.get(m.month)?.high ?? 0,
  }));
  const trendRows = months.slice(-TREND_MONTHS);
  const sum = (pick: (m: MonthRow) => number) => months.reduce((s, m) => s + pick(m), 0);
  const kpi = (value: number, trend: (m: MonthRow) => number, baseline?: number): KpiMetric => ({
    value,
    baseline,
    trend: trendRows.map(trend),
  });

  const totalInvoices = sum((m) => m.invoices);

  return {
    meta: { source: "live", generatedAt: new Date().toISOString() },
    kpis: {
      totalInvoices: kpi(totalInvoices, (m) => m.invoices),
      anomaliesDetected: kpi(sum((m) => m.anomalies), (m) => m.anomalies),
      highPriorityExceptions: kpi(sum((m) => m.high), (m) => m.high),
      exceptionRate: kpi(
        pct(sum((m) => m.with_exc), totalInvoices),
        (m) => pct(m.with_exc, m.invoices),
        PUBLISHED_BASELINES.exception_rate_pct,
      ),
      invoicesWithoutPo: kpi(
        pct(sum((m) => m.no_po), totalInvoices),
        (m) => pct(m.no_po, m.invoices),
        PUBLISHED_BASELINES.invoices_without_po_pct,
      ),
      flaggedValueUsd: kpi(Math.round(sum((m) => m.flagged_value)), (m) => Math.round(m.flagged_value)),
    },
    anomaliesOverTime: months.slice(-CHART_MONTHS).map(({ month, invoices, anomalies }) => ({ month, invoices, anomalies })),
    categoryDistribution: categories,
    flaggedValueByDepartment: await flaggedByDepartment(recent),
    amountDistribution: buckets.map((b) => ({ bucket: AMOUNT_BUCKETS[b.bucket], normal: b.normal, anomalous: b.anomalous })),
  };
}

async function flaggedByDepartment(months: string[]): Promise<DepartmentFlaggedValue[]> {
  if (!months.length) return [];
  const from = `${months[0]}-01`;
  const [rows, categories, names] = await Promise.all([
    query<{ department_id: string; month: string; invoices: number; flagged: number; value: number }>(sql`
      select department_id, month, count(*) as invoices, sum(flagged) as flagged, sum(flagged * amount_usd) as value
      from (
        select cc.department_id, substr(i.invoice_date, 1, 7) as month, i.amount_usd, ${FLAGGED} as flagged
        from invoices i ${JOIN_DEPARTMENT} where i.invoice_date >= ${from}
      ) group by 1, 2`),
    query<{ department_id: string; category: string; n: number }>(sql`
      select cc.department_id, a.category, count(*) as n
      from anomalies a join invoices i on i.invoice_id = a.invoice_id ${JOIN_DEPARTMENT}
      where i.invoice_date >= ${from} and a.status in ('Needs review', 'Investigating')
      group by 1, 2 order by 3 desc`),
    departmentNames(),
  ]);

  const byDept = new Map<string, typeof rows>();
  for (const r of rows) byDept.set(r.department_id, [...(byDept.get(r.department_id) ?? []), r]);
  const topCategory = new Map<string, string>();
  for (const c of categories) if (!topCategory.has(c.department_id)) topCategory.set(c.department_id, c.category);

  return [...byDept.entries()]
    .map(([departmentId, list]) => {
      const invoices = list.reduce((s, r) => s + r.invoices, 0);
      const flaggedInvoices = list.reduce((s, r) => s + r.flagged, 0);
      return {
        departmentId,
        departmentName: names.get(departmentId) ?? departmentId,
        flaggedInvoices,
        flaggedValueUsd: Math.round(list.reduce((s, r) => s + r.value, 0)),
        flaggedRate: round1((flaggedInvoices / invoices) * 100),
        topCategory: topCategory.get(departmentId) ?? "—",
        trend: months.map((m) => list.find((r) => r.month === m)?.flagged ?? 0),
      };
    })
    .sort((a, b) => b.flaggedValueUsd - a.flaggedValueUsd)
    .slice(0, 5);
}
