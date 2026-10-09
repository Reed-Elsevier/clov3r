"use server";

import { generateExplanation, getAnomalyDetail, updateAnomalyStatus } from "@/lib/data/anomalies";
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

export async function requestExplanation(id: string): Promise<AnomalyDetail | null> {
  return generateExplanation(idSchema.parse(id));
}
