import { formatInt, formatPct, formatUsd } from "@/lib/format";
import type { DepartmentFlaggedValue } from "@/lib/types/dashboard";

export function DepartmentTable({ rows }: { rows: DepartmentFlaggedValue[] }) {
  const max = Math.max(...rows.map((r) => r.flaggedValueUsd), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="pb-3 font-medium">Department</th>
            <th className="pb-3 font-medium">Flagged</th>
            <th className="pb-3 font-medium">Rate</th>
            <th className="pb-3 font-medium">Trend</th>
            <th className="pb-3 font-medium">Top category</th>
            <th className="pb-3 text-right font-medium">Flagged value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.departmentId}>
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
                    {r.departmentName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{r.departmentName}</p>
                    <p className="text-xs text-gray-500">{r.departmentId}</p>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-3 tabular-nums text-gray-700">{formatInt(r.flaggedInvoices)}</td>
              <td className="py-3 pr-3 tabular-nums text-gray-700">{formatPct(r.flaggedRate)}</td>
              <td className="py-3 pr-3">
                <Sparkline values={r.trend} />
              </td>
              <td className="py-3 pr-3">
                <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-600">
                  {r.topCategory}
                </span>
              </td>
              <td className="py-3 text-right">
                <p className="font-medium tabular-nums text-gray-900">{formatUsd(r.flaggedValueUsd)}</p>
                <div className="ml-auto mt-1 h-1.5 w-28 rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(r.flaggedValueUsd / max) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 80;
  const h = 24;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values
    .map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - ((v - min) / range) * h}`)
    .join(" ");
  const rising = values[values.length - 1] > values[0];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-label={rising ? "Rising" : "Falling"}>
      <polyline points={points} fill="none" strokeWidth={2} strokeLinejoin="round" stroke={rising ? "var(--danger)" : "var(--success)"} />
    </svg>
  );
}
