import type { AnomalyExplanation } from "@/lib/schemas";

import { generateExplanation } from "./generate";
import { explanationStore, type ExplanationStore } from "./store";

/**
 * Returns the stored explanation for an anomaly, generating and saving one if
 * missing (or when `regenerate` is set). Null when the anomaly doesn't exist.
 */
export async function explainAnomaly(
  anomalyId: string,
  { regenerate = false, store = explanationStore() }: { regenerate?: boolean; store?: ExplanationStore } = {},
): Promise<{ explanation: AnomalyExplanation; generated: boolean } | null> {
  const anomaly = await store.getAnomaly(anomalyId);
  if (!anomaly) return null;

  if (!regenerate) {
    const existing = await store.getExplanation(anomalyId);
    if (existing) return { explanation: existing, generated: false };
  }

  const row = await generateExplanation(anomaly);
  return { explanation: await store.saveExplanation(row), generated: true };
}
