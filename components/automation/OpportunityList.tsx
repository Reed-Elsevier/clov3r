"use client";

import { useMemo, useState } from "react";
import { CONFIDENCE_SAMPLE_SIZE, SCORE_WEIGHTS } from "@/lib/automation/score";
import { formatInt, formatUsdCompact } from "@/lib/format";
import type { AutomationOpportunity, ScoreBreakdown } from "@/lib/types/dashboard";

type SortKey = "score" | "frequency" | "effortHours" | "impactUsd";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "frequency", label: "Frequency" },
  { key: "effortHours", label: "Review effort" },
  { key: "impactUsd", label: "Flagged value" },
];

const FACTOR_LABEL: Record<keyof ScoreBreakdown, string> = {
  frequency: "Frequency",
  effort: "Effort",
  impact: "Impact",
  feasibility: "Feasibility",
  confidence: "Confidence",
};

export function OpportunityList({ opportunities }: { opportunities: AutomationOpportunity[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const sorted = useMemo(() => [...opportunities].sort((a, b) => b[sortKey] - a[sortKey]), [opportunities, sortKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Sort by</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSortKey(s.key)}
            aria-pressed={sortKey === s.key}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              sortKey === s.key ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-brand-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ol className="grid gap-4 xl:grid-cols-2">
        {sorted.map((o, i) => (
          <li key={o.id} className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-gray-900">{o.title}</h3>
                <p className="text-xs text-gray-500">{o.exceptionType} · {o.scope}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-brand">{o.score.toFixed(0)}</p>
                <p className="text-[11px] text-gray-500">score / 100</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Fact label="Occurrences" value={formatInt(o.frequency)} />
              <Fact label="Review hours" value={formatInt(o.effortHours)} />
              <Fact label="Flagged value" value={formatUsdCompact(o.impactUsd)} />
              <Fact label="Feasibility" value={o.feasibility} />
            </dl>

            <div className="space-y-1.5">
              {(Object.keys(SCORE_WEIGHTS) as (keyof ScoreBreakdown)[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-gray-500">{FACTOR_LABEL[k]}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${o.breakdown[k] * 100}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums text-gray-700">×{SCORE_WEIGHTS[k]}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <p className="text-xs text-gray-500">
        Score = 100 × Σ(weight × factor). Frequency, effort and impact are relative to the largest candidate; feasibility
        High/Medium/Low = 1/0.6/0.3; confidence reaches 1 at {CONFIDENCE_SAMPLE_SIZE} historical occurrences.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-100 px-3 py-2">
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
    </div>
  );
}
