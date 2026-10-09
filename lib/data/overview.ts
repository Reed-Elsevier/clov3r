import type { OverviewData } from "@/lib/types/dashboard";
import { mockOverview } from "./mock/overview";

/**
 * Single seam between the Overview page and its data.
 *
 * TODO(feat/ingestion-api): once lib/db + lib/schemas land, compute this from
 * Postgres (the same aggregates /api/metrics exposes) and set meta.source = "live".
 * The page and components consume only OverviewData, so nothing else changes.
 */
export async function getOverviewData(): Promise<OverviewData> {
  return mockOverview;
}
