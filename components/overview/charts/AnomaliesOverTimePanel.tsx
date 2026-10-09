"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, tooltipStyle } from "@/components/charts/theme";
import { Panel, PillSelect } from "@/components/dashboard/Panel";
import { formatInt, formatMonth } from "@/lib/format";
import type { MonthlyAnomalyPoint } from "@/lib/types/dashboard";

const RANGES = [
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
];

export function AnomaliesOverTimePanel({ data, className }: { data: MonthlyAnomalyPoint[]; className?: string }) {
  const [range, setRange] = useState("12");
  const [active, setActive] = useState<number | null>(null);

  const rows = data.slice(-Number(range)).map((d) => ({ ...d, label: formatMonth(d.month) }));
  const peak = rows.reduce((best, d, i) => (d.anomalies > rows[best].anomalies ? i : best), 0);
  const highlighted = active ?? peak;
  const avg = rows.reduce((s, d) => s + d.anomalies, 0) / Math.max(rows.length, 1);
  const recentFrom = Math.floor(rows.length / 2);

  return (
    <Panel
      title="Invoice anomalies over time"
      subtitle="Monthly, by invoice date"
      className={className}
      action={<PillSelect label="Time range" value={range} onChange={setRange} options={RANGES} />}
    >
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%" onMouseLeave={() => setActive(null)}>
            <CartesianGrid vertical={false} stroke="var(--gray-300)" strokeDasharray="3 4" strokeOpacity={0.6} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis tickLine={false} axisLine={false} tick={axisTick} />
            <ReferenceLine y={avg} stroke="var(--gray-900)" strokeDasharray="4 4" strokeOpacity={0.5} />
            <Tooltip cursor={false} formatter={(v) => [formatInt(Number(v)), "Anomalies"]} contentStyle={tooltipStyle} />
            <Bar dataKey="anomalies" radius={[6, 6, 6, 6]} maxBarSize={28} onMouseEnter={(_, i) => setActive(i)}>
              {rows.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === highlighted ? "var(--gray-900)" : i >= recentFrom ? "var(--relx-orange)" : "var(--gray-300)"}
                />
              ))}
              <LabelList
                dataKey="anomalies"
                content={(props) => {
                  const { x, y, width, value, index } = props as { x: number; y: number; width: number; value: number; index: number };
                  if (index !== highlighted) return null;
                  const w = 56;
                  return (
                    <g>
                      <rect x={x + width / 2 - w / 2} y={y - 26} width={w} height={20} rx={10} fill="var(--gray-900)" />
                      <text x={x + width / 2} y={y - 12} textAnchor="middle" fill="var(--white)" fontSize={11} fontWeight={600}>
                        {formatInt(value)}
                      </text>
                    </g>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
        <Legend color="var(--gray-300)" label="Earlier" />
        <Legend color="var(--relx-orange)" label="Recent" />
        <Legend color="var(--gray-900)" label={active === null ? "Peak month" : "Selected"} />
        <span>Dashed line: average {Math.round(avg)}</span>
      </div>
    </Panel>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
