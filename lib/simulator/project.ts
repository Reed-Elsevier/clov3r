import type { SimulatorAssumptions, SimulatorBaseline, SimulatorProjection } from "@/lib/types/dashboard";

const clampPct = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/** Pure projection math shared by the simulator UI and GET /api/simulate. Outputs are projections, not results. */
export function projectImpact(b: SimulatorBaseline, a: SimulatorAssumptions): SimulatorProjection {
  const validation = clampPct(a.automatedValidationPct) / 100;
  const processing = clampPct(a.processingTimeReductionPct) / 100;
  const manual = clampPct(a.manualReviewReductionPct) / 100;

  const exceptionsBaseline = (b.monthlyInvoices * b.exceptionRate) / 100;
  const prevented = b.missingFieldExceptionsPerMonth * validation;
  const exceptionsProjected = Math.max(0, exceptionsBaseline - prevented);

  const reviewsProjected = Math.max(0, (b.manualReviewsPerMonth - prevented) * (1 - manual));
  const hoursBaseline = (b.manualReviewsPerMonth * b.avgReviewMinutes) / 60;
  const hoursProjected = (reviewsProjected * b.avgReviewMinutes) / 60;

  return {
    exceptionsPerMonth: { baseline: exceptionsBaseline, projected: exceptionsProjected },
    exceptionRate: {
      baseline: b.exceptionRate,
      projected: b.monthlyInvoices ? (exceptionsProjected / b.monthlyInvoices) * 100 : 0,
    },
    avgProcessingDays: { baseline: b.avgProcessingDays, projected: b.avgProcessingDays * (1 - processing) },
    reviewHoursPerMonth: { baseline: hoursBaseline, projected: hoursProjected },
    reviewCostPerMonthUsd: {
      baseline: hoursBaseline * b.reviewCostPerHourUsd,
      projected: hoursProjected * b.reviewCostPerHourUsd,
    },
  };
}
