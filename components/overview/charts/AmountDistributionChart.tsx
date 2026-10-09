"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInt } from "@/lib/format";
import type { AmountBucket } from "@/lib/types/dashboard";

export function AmountDistributionChart({ data }: { data: AmountBucket[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--gray-100)" />
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: "var(--gray-500)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--gray-500)", fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "var(--gray-100)" }}
            formatter={(v, name) => [formatInt(Number(v)), name]}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--gray-300)", fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--gray-700)" }} />
          <Bar name="Normal" dataKey="normal" fill="var(--gray-300)" radius={[4, 4, 0, 0]} />
          <Bar name="Anomalous" dataKey="anomalous" fill="var(--relx-orange)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
