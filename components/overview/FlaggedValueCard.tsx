import type { ReactNode } from "react";
import { formatInt, formatUsd, formatUsdCompact, pctChange } from "@/lib/format";
import type { OverviewKpis } from "@/lib/types/dashboard";

export function FlaggedValueCard({ kpis }: { kpis: OverviewKpis }) {
  const { flaggedValueUsd, anomaliesDetected, highPriorityExceptions } = kpis;
  const change = pctChange(flaggedValueUsd.value, flaggedValueUsd.previous);
  const highShare = anomaliesDetected.value ? (highPriorityExceptions.value / anomaliesDetected.value) * 100 : 0;

  return (
    <section className="flex flex-col gap-5 rounded-3xl bg-brand-100 p-6 shadow-sm">
      <div>
        <p className="flex items-baseline gap-2" title={formatUsd(flaggedValueUsd.value)}>
          <span className="text-5xl font-semibold tracking-tight text-gray-900">{formatUsdCompact(flaggedValueUsd.value)}</span>
          <span className="text-sm font-medium uppercase tracking-wider text-gray-500">flagged</span>
        </p>
        {change !== undefined && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-700">
            <span className={`font-medium ${change <= 0 ? "text-success" : "text-danger"}`}>
              {change >= 0 ? "↗" : "↘"} {Math.abs(change).toFixed(1)}%
            </span>
            vs previous period
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">Value of invoices awaiting review — not confirmed loss or savings.</p>
      </div>

      <div className="mt-auto space-y-3">
        <Stat
          icon={<IconAlert />}
          label="Anomalies detected"
          value={formatInt(anomaliesDetected.value)}
          sub="across all detection methods"
        />
        <Stat
          icon={<IconFlag />}
          label="High-priority exceptions"
          value={formatInt(highPriorityExceptions.value)}
          sub={`${highShare.toFixed(1)}% of anomalies`}
          danger
        />
      </div>
    </section>
  );
}

function Stat({ icon, label, value, sub, danger = false }: { icon: ReactNode; label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/60 p-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-danger/10 text-danger" : "bg-white text-brand-600"}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      <span className="text-lg font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M4 22V4M4 4h13l-2 4 2 4H4" />
    </svg>
  );
}
