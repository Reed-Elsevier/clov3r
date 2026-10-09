import Link from "next/link";
import type { ReactNode } from "react";
import type { AnomalyPriority, AnomalyStatus } from "@/lib/types/dashboard";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/investigation"
          title="Exceptions awaiting review"
          aria-label="Exceptions awaiting review"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm transition-colors hover:bg-brand-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />
        </Link>
        {action}
      </div>
    </header>
  );
}

export const darkPillClass =
  "rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600";

const PRIORITY_STYLE: Record<AnomalyPriority, string> = {
  High: "bg-danger/10 text-danger",
  Medium: "bg-warning/20 text-gray-900",
  Low: "bg-gray-100 text-gray-700",
};

const STATUS_STYLE: Record<AnomalyStatus, string> = {
  "Needs review": "bg-brand-100 text-brand-600",
  Investigating: "bg-warning/20 text-gray-900",
  Resolved: "bg-success/10 text-success",
  Dismissed: "bg-gray-100 text-gray-500",
};

export function PriorityBadge({ priority }: { priority: AnomalyPriority }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PRIORITY_STYLE[priority]}`}>{priority}</span>;
}

export function StatusBadge({ status }: { status: AnomalyStatus }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function Tag({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "gray" | "projected" }) {
  const style = {
    brand: "bg-brand-100 text-brand-600",
    gray: "bg-gray-100 text-gray-700",
    projected: "border border-dashed border-brand bg-white text-brand-600",
  }[tone];
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>{children}</span>;
}
