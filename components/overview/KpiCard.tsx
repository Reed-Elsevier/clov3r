import { pctChange } from "@/lib/format";
import type { KpiMetric } from "@/lib/types/dashboard";

export function KpiCard({
  label,
  metric,
  format,
  dark = false,
  lowerIsBetter = false,
  baselineLabel,
}: {
  label: string;
  metric: KpiMetric;
  format: (n: number) => string;
  dark?: boolean;
  /** For exception/anomaly KPIs a decrease is good news. */
  lowerIsBetter?: boolean;
  baselineLabel?: string;
}) {
  const change = pctChange(metric.value, metric.previous);
  const vsBaseline = metric.baseline !== undefined ? metric.value - metric.baseline : undefined;
  const max = Math.max(...metric.trend, 1);

  return (
    <div
      className={`flex items-end justify-between gap-4 rounded-3xl p-5 shadow-sm ${
        dark ? "bg-gray-900 text-white" : "bg-white text-gray-900"
      }`}
    >
      <div className="min-w-0">
        <p className={`text-xs font-medium ${dark ? "text-gray-300" : "text-gray-500"}`}>{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{format(metric.value)}</p>
        {change !== undefined && <Delta change={change} lowerIsBetter={lowerIsBetter} dark={dark} />}
        {vsBaseline !== undefined && metric.baseline !== undefined && (
          <p className={`mt-1 text-xs ${dark ? "text-gray-300" : "text-gray-500"}`}>
            {baselineLabel ?? "Baseline"} {format(metric.baseline)} ·{" "}
            <span className={(vsBaseline <= 0) === lowerIsBetter ? "text-success" : "text-danger"}>
              {vsBaseline > 0 ? "+" : ""}
              {vsBaseline.toFixed(1)} pts
            </span>
          </p>
        )}
      </div>

      <div className="flex h-14 shrink-0 items-end gap-1" aria-hidden>
        {metric.trend.map((v, i) => {
          const last = i === metric.trend.length - 1;
          return (
            <span
              key={i}
              className={`w-2 rounded-full ${last ? "bg-brand" : dark ? "bg-white/20" : "bg-gray-100"}`}
              style={{ height: `${Math.max(14, (v / max) * 100)}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function Delta({ change, lowerIsBetter, dark }: { change: number; lowerIsBetter: boolean; dark: boolean }) {
  const good = lowerIsBetter ? change <= 0 : change >= 0;
  const chip = dark ? "bg-white/10 text-white" : good ? "bg-success/10 text-success" : "bg-danger/10 text-danger";
  return (
    <p className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs ${dark ? "text-gray-300" : "text-gray-500"}`}>
      <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 font-medium ${chip}`}>
        {change >= 0 ? "↗" : "↘"} {Math.abs(change).toFixed(1)}%
      </span>
      <span className="whitespace-nowrap">vs last period</span>
    </p>
  );
}
