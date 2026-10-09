"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, legendStyle, tooltipStyle } from "@/components/charts/theme";
import { Tag } from "@/components/dashboard/ui";
import { formatInt, formatPct, formatUsd } from "@/lib/format";
import { projectImpact } from "@/lib/simulator/project";
import type { ProjectedValue, SimulatorAssumptions, SimulatorBaseline } from "@/lib/types/dashboard";

const SLIDERS: { key: keyof SimulatorAssumptions; label: string }[] = [
  { key: "automatedValidationPct", label: "What if automated validation prevents X% of missing-field errors?" },
  { key: "processingTimeReductionPct", label: "What if processing time decreases by X%?" },
  { key: "manualReviewReductionPct", label: "What if manual reviews drop by X% for invoices passing all checks?" },
];

export function ImpactSimulator({ baseline }: { baseline: SimulatorBaseline }) {
  const [a, setA] = useState<SimulatorAssumptions>({
    automatedValidationPct: 30,
    processingTimeReductionPct: 20,
    manualReviewReductionPct: 25,
  });
  const p = projectImpact(baseline, a);

  const chart = [
    { metric: "Exceptions / mo", Current: p.exceptionsPerMonth.baseline, Projected: p.exceptionsPerMonth.projected },
    { metric: "Review hours / mo", Current: p.reviewHoursPerMonth.baseline, Projected: p.reviewHoursPerMonth.projected },
  ].map((r) => ({ ...r, Current: Math.round(r.Current), Projected: Math.round(r.Projected) }));

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm lg:grid-cols-3">
        {SLIDERS.map((s) => (
          <label key={s.key} className="flex flex-col gap-2 text-sm text-gray-700">
            <span className="min-h-10">{s.label}</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={a[s.key]}
                onChange={(e) => setA((prev) => ({ ...prev, [s.key]: Number(e.target.value) }))}
                className="flex-1 accent-brand"
              />
              <span className="w-12 text-right font-semibold tabular-nums text-brand-600">{a[s.key]}%</span>
            </div>
          </label>
        ))}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Compare label="Exception rate" v={p.exceptionRate} format={(n) => formatPct(n)} />
        <Compare label="Exceptions per month" v={p.exceptionsPerMonth} format={(n) => formatInt(Math.round(n))} />
        <Compare label="Avg processing time" v={p.avgProcessingDays} format={(n) => `${n.toFixed(1)} days`} />
        <Compare label="Review cost per month" v={p.reviewCostPerMonthUsd} format={formatUsd} />
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">Current vs projected workload</h2>
          <Tag tone="projected">Projected / Assumption</Tag>
        </header>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--gray-100)" />
              <XAxis dataKey="metric" tickLine={false} axisLine={false} tick={axisTick} />
              <YAxis tickLine={false} axisLine={false} tick={axisTick} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [formatInt(Number(v)), name]} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
              <Bar dataKey="Current" fill="var(--gray-900)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Projected" fill="var(--relx-orange)" fillOpacity={0.55} stroke="var(--relx-orange)" strokeDasharray="4 3" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <p className="text-xs text-gray-500">
        Assumptions: {formatInt(baseline.monthlyInvoices)} invoices/month, {formatInt(baseline.missingFieldExceptionsPerMonth)} missing-field
        exceptions/month, {formatInt(baseline.manualReviewsPerMonth)} manual reviews at {baseline.avgReviewMinutes} min each, reviewer cost{" "}
        {formatUsd(baseline.reviewCostPerHourUsd)}/h (assumed). Projections are hypothetical scenarios, not measured results.
      </p>
    </div>
  );
}

function Compare({ label, v, format }: { label: string; v: ProjectedValue; format: (n: number) => string }) {
  const delta = v.baseline ? ((v.projected - v.baseline) / v.baseline) * 100 : 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-gray-500">Current</p>
        <p className="text-lg font-semibold text-gray-900">{format(v.baseline)}</p>
      </div>
      <div className="rounded-xl border border-dashed border-brand bg-brand-100/50 px-3 py-2">
        <p className="text-[11px] uppercase tracking-wider text-brand-600">Projected</p>
        <p className="text-lg font-semibold text-brand-600">
          {format(v.projected)}{" "}
          <span className="text-xs font-medium text-gray-700">({delta <= 0 ? "" : "+"}{delta.toFixed(1)}%)</span>
        </p>
      </div>
    </div>
  );
}
