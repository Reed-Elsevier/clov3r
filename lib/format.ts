const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const integer = new Intl.NumberFormat("en-US");

export const formatUsdCompact = (n: number) => usdCompact.format(n);
export const formatUsd = (n: number) => usd.format(n);
export const formatInt = (n: number) => integer.format(n);
export const formatPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

/** Percent change between two values; undefined when there's no prior value. */
export function pctChange(current: number, previous?: number) {
  if (previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

/** "2026-03" -> "Mar 26" */
export function formatMonth(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
