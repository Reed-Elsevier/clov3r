"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisTick, legendStyle, tooltipStyle } from "@/components/charts/theme";
import { formatInt, formatMonth } from "@/lib/format";
import type { DelayTrendPoint, DepartmentExceptions, ReviewTimeByType } from "@/lib/types/dashboard";

export function DepartmentExceptionsChart({ data }: { data: DepartmentExceptions[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--gray-100)" />
          <XAxis dataKey="departmentName" tickLine={false} axisLine={false} tick={axisTick} interval={0} tickFormatter={(v: string) => v.split(" ")[0]} />
          <YAxis yAxisId="count" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis yAxisId="rate" orientation="right" tickLine={false} axisLine={false} tick={axisTick} unit="%" />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === "Exception rate" ? `${v}%` : formatInt(Number(v)), name]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
          <Bar yAxisId="count" name="Exceptions" dataKey="exceptions" fill="var(--relx-orange)" radius={[6, 6, 0, 0]} />
          <Line yAxisId="rate" name="Exception rate" dataKey="exceptionRate" stroke="var(--gray-900)" strokeWidth={2} dot={{ r: 3 }} />
          <ReferenceLine yAxisId="rate" y={19.5} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: "19.5% baseline", position: "insideTopRight", fill: "var(--danger)", fontSize: 11 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReviewTimeChart({ data }: { data: ReviewTimeByType[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--gray-100)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} unit="h" />
          <YAxis type="category" dataKey="exceptionType" tickLine={false} axisLine={false} tick={axisTick} width={130} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v} h`, name]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
          <Bar name="Median" dataKey="medianHours" fill="var(--relx-orange)" radius={[0, 4, 4, 0]} />
          <Bar name="90th percentile" dataKey="p90Hours" fill="var(--gray-300)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DelayTrendChart({ data }: { data: DelayTrendPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: formatMonth(d.month) }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--gray-100)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis yAxisId="count" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis yAxisId="days" orientation="right" tickLine={false} axisLine={false} tick={axisTick} unit="d" />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={legendStyle} />
          <Bar yAxisId="count" name="Resolved" dataKey="resolvedExceptions" stackId="ex" fill="var(--gray-300)" />
          <Bar yAxisId="count" name="Still open" dataKey="openExceptions" stackId="ex" fill="var(--relx-orange)" radius={[4, 4, 0, 0]} />
          <ReferenceLine yAxisId="days" y={0} stroke="var(--gray-500)" strokeDasharray="4 4" />
          <Line yAxisId="days" name="Avg days vs due" dataKey="avgDaysVsDue" stroke="var(--danger)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
