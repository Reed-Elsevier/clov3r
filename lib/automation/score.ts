import type { AutomationCandidate, AutomationOpportunity, Feasibility } from "@/lib/types/dashboard";

/**
 * Explainable ranking (PLAN-09): weighted sum of factors, each normalised to 0-1.
 * frequency/effort/impact are relative to the largest candidate; confidence grows with sample size.
 */
export const SCORE_WEIGHTS = {
  frequency: 0.3,
  effort: 0.25,
  impact: 0.25,
  feasibility: 0.1,
  confidence: 0.1,
} as const;

const FEASIBILITY_VALUE: Record<Feasibility, number> = { High: 1, Medium: 0.6, Low: 0.3 };

/** Occurrences needed for full confidence. */
export const CONFIDENCE_SAMPLE_SIZE = 200;

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toLocaleString("en-US");

export function scoreOpportunities(candidates: AutomationCandidate[]): AutomationOpportunity[] {
  const maxOf = (pick: (c: AutomationCandidate) => number) => Math.max(...candidates.map(pick), 1);
  const maxFreq = maxOf((c) => c.frequency);
  const maxEffort = maxOf((c) => c.effortHours);
  const maxImpact = maxOf((c) => c.impactUsd);

  return candidates
    .map((c) => {
      const breakdown = {
        frequency: c.frequency / maxFreq,
        effort: c.effortHours / maxEffort,
        impact: c.impactUsd / maxImpact,
        feasibility: FEASIBILITY_VALUE[c.feasibility],
        confidence: Math.min(1, c.frequency / CONFIDENCE_SAMPLE_SIZE),
      };
      const score =
        100 *
        (Object.keys(SCORE_WEIGHTS) as (keyof typeof SCORE_WEIGHTS)[]).reduce(
          (sum, k) => sum + SCORE_WEIGHTS[k] * breakdown[k],
          0,
        );
      const target = Math.round(c.frequency * (1 - c.estimatedReductionPct / 100));

      return {
        ...c,
        score: round1(score),
        breakdown,
        successCriterion: `${c.proposedControl} could reduce "${c.exceptionType}" exceptions by an estimated ${c.estimatedReductionPct}% (from ${fmt(c.frequency)} to ≤${fmt(target)} per period), based on ${fmt(c.frequency)} historical occurrences and ${fmt(Math.round(c.effortHours))} review hours.`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
