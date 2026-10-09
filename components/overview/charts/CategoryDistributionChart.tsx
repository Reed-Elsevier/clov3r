"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatInt } from "@/lib/format";
import type { CategoryCount } from "@/lib/types/dashboard";

const COLORS = [
  "var(--relx-orange)",
  "var(--orange-600)",
  "var(--gray-900)",
  "var(--gray-700)",
  "var(--gray-500)",
  "var(--gray-300)",
  "var(--orange-100)",
];

const COLORS_DARK = [
  "var(--relx-orange)",
  "var(--orange-600)",
  "var(--orange-100)",
  "var(--white)",
  "var(--gray-300)",
  "var(--gray-500)",
  "var(--gray-700)",
];

export function CategoryDistributionChart({ data, dark = false }: { data: CategoryCount[]; dark?: boolean }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const colors = dark ? COLORS_DARK : COLORS;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="category" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, name) => [formatInt(Number(v)), name]}
              contentStyle={{ borderRadius: 12, border: "1px solid var(--gray-300)", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{formatInt(total)}</span>
          <span className={`text-[11px] ${dark ? "text-gray-300" : "text-gray-500"}`}>anomalies</span>
        </div>
      </div>

      <ul className="flex-1 space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.category} className={`flex items-center gap-2 ${dark ? "rounded-xl bg-white/5 px-3 py-1.5" : ""}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
            <span className={`flex-1 truncate ${dark ? "text-gray-300" : "text-gray-700"}`}>{d.category}</span>
            <span className={`tabular-nums ${dark ? "text-white" : "text-gray-900"}`}>{((d.count / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
