"use server";

import { getAnomalyDetail, updateAnomalyStatus } from "@/lib/data/anomalies";
import { explainAnomaly } from "@/lib/explanations/service";
import { anomalySchema, updateAnomalyStatusSchema, type AnomalyDetail, type AnomalyStatus } from "@/lib/schemas";

// TODO: add an auth/role check here once authentication exists — these are callable via direct POST.
const idSchema = anomalySchema.shape.anomaly_id;

export async function fetchAnomalyDetail(id: string): Promise<AnomalyDetail | null> {
  return getAnomalyDetail(idSchema.parse(id));
}

export async function setAnomalyStatus(id: string, status: AnomalyStatus): Promise<AnomalyDetail | null> {
  const parsed = updateAnomalyStatusSchema.extend({ id: idSchema }).parse({ id, status });
  return updateAnomalyStatus(parsed.id, parsed.status);
}

export async function requestExplanation(id: string, regenerate = false): Promise<AnomalyDetail | null> {
  const anomalyId = idSchema.parse(id);
  await explainAnomaly(anomalyId, { regenerate: regenerate === true });
  return getAnomalyDetail(anomalyId);
}
