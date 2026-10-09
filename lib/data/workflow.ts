import type { WorkflowInsights } from "@/lib/types/dashboard";
import { mockWorkflow } from "./mock/workflow";

/** TODO(feat/ingestion-api): compute from cost_centers / suppliers / invoice_exceptions / payments joins. */
export async function getWorkflowInsights(): Promise<WorkflowInsights> {
  return mockWorkflow;
}
