import { scoreOpportunities } from "@/lib/automation/score";
import type { AutomationOpportunities } from "@/lib/types/dashboard";
import { mockAutomationCandidates } from "./mock/automation";

/** TODO(feat/ingestion-api): derive candidates from invoice_exceptions/invoices aggregates; scoring stays the same. */
export async function getAutomationOpportunities(): Promise<AutomationOpportunities> {
  return {
    meta: { source: "mock", generatedAt: "2026-10-08T00:00:00.000Z" },
    opportunities: scoreOpportunities(mockAutomationCandidates),
  };
}
