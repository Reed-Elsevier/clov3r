import type { SimulatorBaseline } from "@/lib/types/dashboard";

/** TODO(feat/ingestion-api): read monthly volumes, exception rate and processing time from /api/metrics aggregates. */
export async function getSimulatorBaseline(): Promise<SimulatorBaseline> {
  return {
    meta: { source: "mock", generatedAt: "2026-10-08T00:00:00.000Z" },
    monthlyInvoices: 2068,
    exceptionRate: 19.5,
    missingFieldExceptionsPerMonth: 112,
    avgProcessingDays: 8.4,
    manualReviewsPerMonth: 640,
    avgReviewMinutes: 38,
    reviewCostPerHourUsd: 45,
  };
}
