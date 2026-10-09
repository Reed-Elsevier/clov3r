import { Suspense } from "react";
import { EmptyState, PageSkeleton, Panel } from "@/components/dashboard/Panel";
import { PageHeader, SampleDataBanner, Tag } from "@/components/dashboard/ui";
import { DelayTrendChart, DepartmentExceptionsChart, ReviewTimeChart } from "@/components/workflow/charts";
import { getWorkflowInsights } from "@/lib/data/workflow";
import { formatInt, formatPct } from "@/lib/format";
import type { SupplierExceptions } from "@/lib/types/dashboard";

export default function WorkflowPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Workflow Intelligence" subtitle="Recurring operational issues by department, supplier and exception type" />
      <Suspense fallback={<PageSkeleton />}>
        <WorkflowContent />
      </Suspense>
    </div>
  );
}

async function WorkflowContent() {
  const { meta, byDepartment, bySupplier, reviewTimeByType, delayTrend } = await getWorkflowInsights();
  const slowest = [...reviewTimeByType].sort((a, b) => b.totalHours - a.totalHours)[0];
  const worstDept = [...byDepartment].sort((a, b) => b.exceptionRate - a.exceptionRate)[0];
  const worstSupplier = [...bySupplier].sort((a, b) => b.exceptionRate - a.exceptionRate)[0];

  return (
    <>
      <SampleDataBanner source={meta.source} />

      <div className="grid gap-4 md:grid-cols-3">
        {worstDept && (
          <Insight label="Highest exception rate" value={worstDept.departmentName} detail={`${formatPct(worstDept.exceptionRate)} of invoices vs 19.5% baseline`} />
        )}
        {slowest && (
          <Insight label="Most review time consumed" value={slowest.exceptionType} detail={`${formatInt(slowest.totalHours)} review hours across ${formatInt(slowest.count)} exceptions`} />
        )}
        {worstSupplier && (
          <Insight label="Supplier with most recurring issues" value={worstSupplier.supplierName} detail={`${formatPct(worstSupplier.exceptionRate)} exception rate · mostly ${worstSupplier.topExceptionType}`} />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Exceptions by department" subtitle="Count and rate, via cost_centers.department_id">
          {byDepartment.length ? <DepartmentExceptionsChart data={byDepartment} /> : <EmptyState />}
        </Panel>
        <Panel title="Review time by exception type" subtitle="resolved_at − raised_at, hours">
          {reviewTimeByType.length ? <ReviewTimeChart data={reviewTimeByType} /> : <EmptyState />}
        </Panel>
      </div>

      <Panel title="Payment delays and open exceptions" subtitle="Monthly average days vs due (positive = paid late) and exception backlog">
        {delayTrend.length ? <DelayTrendChart data={delayTrend} /> : <EmptyState />}
      </Panel>

      <Panel title="Suppliers with recurring data-quality issues" subtitle="Exceptions relative to invoice volume">
        {bySupplier.length ? <SupplierTable rows={bySupplier} /> : <EmptyState />}
      </Panel>
    </>
  );
}

function Insight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-700">{detail}</p>
    </div>
  );
}

const RISK_TONE = { High: "text-danger", Medium: "text-warning", Low: "text-success" } as const;

function SupplierTable({ rows }: { rows: SupplierExceptions[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="pb-3 font-medium">Supplier</th>
            <th className="pb-3 font-medium">Category</th>
            <th className="pb-3 font-medium">Risk tier</th>
            <th className="pb-3 text-right font-medium">Invoices</th>
            <th className="pb-3 text-right font-medium">Exceptions</th>
            <th className="pb-3 pl-4 font-medium">Exception rate</th>
            <th className="pb-3 font-medium">Top issue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.supplierId}>
              <td className="py-3 pr-3">
                <p className="font-medium text-gray-900">{r.supplierName}</p>
                <p className="text-xs text-gray-500">{r.supplierId}</p>
              </td>
              <td className="py-3 pr-3 text-gray-700">{r.category}</td>
              <td className={`py-3 pr-3 font-medium ${RISK_TONE[r.riskTier]}`}>{r.riskTier}</td>
              <td className="py-3 text-right tabular-nums text-gray-700">{formatInt(r.invoices)}</td>
              <td className="py-3 text-right tabular-nums text-gray-700">{formatInt(r.exceptions)}</td>
              <td className="py-3 pl-4">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, r.exceptionRate * 2)}%` }} />
                  </div>
                  <span className="tabular-nums text-gray-900">{formatPct(r.exceptionRate)}</span>
                </div>
              </td>
              <td className="py-3"><Tag>{r.topExceptionType}</Tag></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
