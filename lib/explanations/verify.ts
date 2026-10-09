/**
 * Numeric cross-check for generated explanations (PLAN-05 §4, IDEA.md §9):
 * every number or date the text mentions must trace back to a value in the
 * anomaly's evidence. Catches invented figures; it is a simple presence check,
 * not a semantic one.
 */

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
// Standalone numbers only: digits glued to letters/hyphens (INV9000002, MCP-2608-001, L3) are identifiers.
const NUMBER =
  /(?<![\w.-])(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|x|k|K|m|M|bn|million|billion|thousand)?(?![\w-])/g;

const MULTIPLIER: Record<string, number> = { k: 1e3, K: 1e3, thousand: 1e3, m: 1e6, M: 1e6, million: 1e6, bn: 1e9, billion: 1e9 };

/** Small integers are counts/list numbering ("2 days", "step 3") and are not checked. */
const IGNORE_AT_OR_BELOW = 10;

interface Claim {
  text: string;
  value: number;
  tolerance: number;
  percent: boolean;
}

export function extractClaims(text: string): { claims: Claim[]; dates: string[] } {
  const dates = text.match(DATE) ?? [];
  const withoutDates = text.replace(DATE, " ");
  const claims: Claim[] = [];
  for (const m of withoutDates.matchAll(NUMBER)) {
    const [raw, minus, int, frac = "", suffix = ""] = m;
    const mult = MULTIPLIER[suffix] ?? 1;
    const value = Number(`${minus ?? ""}${int.replace(/,/g, "")}${frac}`) * mult;
    const decimals = frac ? frac.length - 1 : 0;
    claims.push({ text: raw.trim(), value, tolerance: 0.5 * 10 ** -decimals * mult, percent: suffix === "%" });
  }
  return { claims, dates };
}

/** Every number and ISO date found anywhere in the evidence (including inside strings). */
export function collectEvidenceFacts(evidence: unknown): { numbers: number[]; dates: Set<string> } {
  const numbers: number[] = [];
  const dates = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) numbers.push(v);
    else if (typeof v === "string") {
      for (const d of v.match(DATE) ?? []) {
        dates.add(d);
        d.split("-").forEach((p) => numbers.push(Number(p)));
      }
      for (const m of v.replace(/,(?=\d{3})/g, "").matchAll(/-?\d+(?:\.\d+)?/g)) numbers.push(Number(m[0]));
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(evidence);
  return { numbers, dates };
}

function supported(claim: Claim, evidence: number[]): boolean {
  const candidates = claim.percent ? [claim.value, claim.value / 100] : [claim.value];
  return evidence.some((e) =>
    candidates.some((c, i) => {
      const tol = i === 0 ? claim.tolerance : claim.tolerance / 100;
      return Math.abs(Math.abs(c) - Math.abs(e)) <= tol + 1e-9;
    }),
  );
}

export interface VerificationResult {
  ok: boolean;
  /** Numbers/dates in the text with no matching evidence value. */
  unsupported: string[];
}

/** `extraNumbers` covers non-evidence facts the model was given (e.g. the anomaly score). */
export function verifyNumbers(texts: string[], evidence: unknown, extraNumbers: number[] = []): VerificationResult {
  const facts = collectEvidenceFacts(evidence);
  const known = [...facts.numbers, ...extraNumbers];
  const unsupported = new Set<string>();

  for (const text of texts) {
    const { claims, dates } = extractClaims(text);
    for (const d of dates) if (!facts.dates.has(d)) unsupported.add(d);
    for (const c of claims) {
      if (Number.isInteger(c.value) && Math.abs(c.value) <= IGNORE_AT_OR_BELOW && !c.percent) continue;
      if (!supported(c, known)) unsupported.add(c.text);
    }
  }
  return { ok: unsupported.size === 0, unsupported: [...unsupported] };
}
