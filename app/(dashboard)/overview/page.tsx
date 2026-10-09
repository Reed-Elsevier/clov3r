import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, Panel } from "@/components/dashboard/Panel";
import { darkPillClass, PageHeader } from "@/components/dashboard/ui";
import { FlaggedValueCard } from "@/components/overview/FlaggedValueCard";
import { KpiCard } from "@/components/overview/KpiCard";
import { DepartmentTable } from "@/components/overview/DepartmentTable";
import { AnomaliesOverTimePanel } from "@/components/overview/charts/AnomaliesOverTimePanel";
import { AmountDistributionChart } from "@/components/overview/charts/AmountDistributionChart";
import { CategoryDistributionChart } from "@/components/overview/charts/CategoryDistributionChart";
import { getOverviewData } from "@/lib/data/overview";
import { formatInt, formatPct } from "@/lib/format";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Executive Overview"
        subtitle="Invoice anomalies and exceptions requiring human review"
        action={
          <Link href="/investigation" className={darkPillClass}>
            Review exceptions
          </Link>
        }
      />

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}

async function OverviewContent() {
  const { kpis, anomaliesOverTime, categoryDistribution, flaggedValueByDepartment, amountDistribution } =
    await getOverviewData();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard dark label="Total invoices analyzed" metric={kpis.totalInvoices} format={formatInt} />
        <KpiCard label="Anomalies detected" metric={kpis.anomaliesDetected} format={formatInt} lowerIsBetter />
        <KpiCard
          label="Invoice exception rate"
          metric={kpis.exceptionRate}
          format={(n) => formatPct(n)}
          lowerIsBetter
          baselineLabel="Published baseline"
        />
        <KpiCard
          label="Invoices without PO"
          metric={kpis.invoicesWithoutPo}
          format={(n) => formatPct(n)}
          lowerIsBetter
          baselineLabel="Published baseline"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {anomaliesOverTime.length ? (
          <AnomaliesOverTimePanel data={anomaliesOverTime} className="xl:col-span-2" />
        ) : (
          <Panel title="Invoice anomalies over time" className="xl:col-span-2">
            <EmptyState />
          </Panel>
        )}
        <FlaggedValueCard kpis={kpis} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Flagged invoice value by department" subtitle="Last 6 months" className="xl:col-span-2">
          {flaggedValueByDepartment.length ? <DepartmentTable rows={flaggedValueByDepartment} /> : <EmptyState />}
        </Panel>
        <Panel title="Anomalies by category" subtitle="Share of all detected anomalies" dark>
          {categoryDistribution.length ? <CategoryDistributionChart data={categoryDistribution} dark /> : <EmptyState />}
        </Panel>
      </div>

      <Panel title="Normal vs. anomalous invoice amounts" subtitle="Invoice count by amount range (USD)">
        {amountDistribution.length ? <AmountDistributionChart data={amountDistribution} /> : <EmptyState />}
      </Panel>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-white" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-80 rounded-2xl bg-white xl:col-span-2" />
        <div className="h-80 rounded-2xl bg-brand-100" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="h-72 rounded-2xl bg-white xl:col-span-2" />
        <div className="h-72 rounded-2xl bg-white" />
      </div>
    </div>
  );
}
