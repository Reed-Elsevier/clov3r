import type { ReactNode } from "react";

export function Panel({
  title,
  subtitle,
  action,
  dark = false,
  className = "",
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  dark?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col rounded-3xl p-6 shadow-sm ${dark ? "bg-gray-900 text-white" : "bg-white"} ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className={`text-lg font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{title}</h2>}
            {subtitle && <p className={`mt-0.5 text-xs ${dark ? "text-gray-300" : "text-gray-500"}`}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PillSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="cursor-pointer appearance-none rounded-full bg-gray-900 py-1.5 pl-3.5 pr-8 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" fill="currentColor" className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-white" aria-hidden>
        <path d="M6 9l6 7 6-7z" />
      </svg>
    </span>
  );
}

export function EmptyState({ message = "No data yet." }: { message?: string }) {
  return (
    <div className="flex min-h-40 flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
      {message}
    </div>
  );
}

export function PageSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className="h-64 rounded-2xl bg-white" />
      ))}
    </div>
  );
}
