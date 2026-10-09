/**
 * Pure cleaning helpers for the dirty `dataset/raw/*_raw.csv` files
 * (rules from dataset/_docs/06_data_quality_plan.md). No I/O here so every
 * rule is unit-testable with small hand-built fixtures.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function isoIfValid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_DATE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
const MON_DATE = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/** Parses a date in ISO, DD-MM-YYYY or "Mon DD, YYYY" form. Returns YYYY-MM-DD or null. */
export function parseDate(input: string): string | null {
  const s = input.trim();
  let m = ISO_DATE.exec(s);
  if (m) return isoIfValid(+m[1], +m[2], +m[3]);
  m = DMY_DATE.exec(s);
  if (m) return isoIfValid(+m[3], +m[2], +m[1]);
  m = MON_DATE.exec(s);
  if (m) {
    const name = m[1].toLowerCase();
    const month = MONTHS[name] ?? MONTHS[name.slice(0, 3)];
    return month ? isoIfValid(+m[3], month, +m[2]) : null;
  }
  return null;
}

/** Splits "date[ T]time" (time optional) and normalises both parts. */
function splitDateTime(input: string): { date: string | null; time: string | null; hasTime: boolean } {
  const s = input.trim().replace(/\s+/g, " ");
  const tIdx = s.indexOf("T");
  if (tIdx > 0 && ISO_DATE.test(s.slice(0, tIdx))) {
    return { date: parseDate(s.slice(0, tIdx)), time: parseTime(s.slice(tIdx + 1)), hasTime: true };
  }
  const lastSpace = s.lastIndexOf(" ");
  if (lastSpace > 0 && TIME.test(s.slice(lastSpace + 1))) {
    return { date: parseDate(s.slice(0, lastSpace)), time: parseTime(s.slice(lastSpace + 1)), hasTime: true };
  }
  return { date: parseDate(s), time: "00:00:00", hasTime: false };
}

function parseTime(input: string): string | null {
  const m = TIME.exec(input.replace(/Z$|[+-]\d{2}:?\d{2}$/, ""));
  if (!m) return null;
  const [h, min, sec] = [+m[1], +m[2], +(m[3] ?? 0)];
  if (h > 23 || min > 59 || sec > 59) return null;
  return `${pad(h)}:${pad(min)}:${pad(sec)}`;
}

export interface Normalized<T> {
  value: T | null;
  /** True when the output differs from the trimmed input (i.e. a fix was applied). */
  changed: boolean;
}

/** Normalises any supported date (optionally with a time part) to `YYYY-MM-DD`. */
export function normalizeDate(input: string): Normalized<string> {
  const { date } = splitDateTime(input);
  return { value: date, changed: date !== null && date !== input.trim() };
}

/** Normalises any supported date/time to `YYYY-MM-DD HH:MM:SS` (midnight if no time given). */
export function normalizeTimestamp(input: string): Normalized<string> {
  const { date, time } = splitDateTime(input);
  const value = date && time ? `${date} ${time}` : null;
  return { value, changed: value !== null && value !== input.trim() };
}

/** Trims and collapses internal whitespace. */
export function cleanText(input: string): Normalized<string> {
  const value = input.trim().replace(/\s+/g, " ");
  return { value, changed: value !== input };
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export type EnumFix = "none" | "casing" | "typo";

/**
 * Maps a categorical value onto its allowed spelling: exact match, then
 * case/whitespace-insensitive match, then a unique closest match within
 * `maxDistance` edits. Returns null when no safe match exists.
 */
export function matchEnum<T extends string>(
  input: string,
  allowed: readonly T[],
  maxDistance = 2,
): { value: T | null; fix: EnumFix } {
  const exact = allowed.find((a) => a === input);
  if (exact) return { value: exact, fix: "none" };

  const key = input.trim().replace(/\s+/g, " ").toLowerCase();
  const loose = allowed.find((a) => a.toLowerCase() === key);
  if (loose) return { value: loose, fix: "casing" };

  let best: T | null = null;
  let bestDist = Infinity;
  let tie = false;
  for (const a of allowed) {
    const d = levenshtein(key, a.toLowerCase());
    if (d < bestDist) [best, bestDist, tie] = [a, d, false];
    else if (d === bestDist) tie = true;
  }
  return best && bestDist <= maxDistance && !tie ? { value: best, fix: "typo" } : { value: null, fix: "none" };
}

/** Parses numbers that may carry thousands separators or stray whitespace. */
export function parseNumber(input: string): Normalized<number> {
  const s = input.trim();
  const stripped = s.replace(/,/g, "");
  if (stripped === "" || !/^-?\d+(\.\d+)?$/.test(stripped)) return { value: null, changed: false };
  return { value: Number(stripped), changed: stripped !== s };
}

/**
 * Drops near-duplicate rows that share a primary key once whitespace is
 * trimmed, keeping the earliest `_ingested_at` (first occurrence on ties or
 * when the timestamp can't be parsed).
 */
export function dedupeByKey<R extends Record<string, string>>(
  rows: R[],
  keyColumn: string,
  ingestedAtColumn = "_ingested_at",
): { kept: R[]; dropped: R[] } {
  const best = new Map<string, { row: R; at: string; index: number }>();
  const dropped: R[] = [];

  rows.forEach((row, index) => {
    const key = (row[keyColumn] ?? "").trim();
    const at = normalizeTimestamp(row[ingestedAtColumn] ?? "").value ?? "9999-12-31 23:59:59";
    const current = best.get(key);
    if (!current) {
      best.set(key, { row, at, index });
    } else if (at < current.at) {
      dropped.push(current.row);
      best.set(key, { row, at, index });
    } else {
      dropped.push(row);
    }
  });

  const kept = [...best.values()].sort((a, b) => a.index - b.index).map((e) => e.row);
  return { kept, dropped };
}
