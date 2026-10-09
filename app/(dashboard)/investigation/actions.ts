"use server";

import {
  generateExplanation,
  getAnomaly,
  updateAnomalyStatus,
} from "@/lib/data/anomalies";
import { ANOMALY_STATUSES, type AnomalyDetail, type AnomalyStatus } from "@/lib/types/dashboard";

// TODO: add an auth/role check here once authentication exists — these are callable via direct POST.
const ID_PATTERN = /^ANM-\d{1,10}$/;

function assertId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new Error("Invalid anomaly id");
}

export async function fetchAnomalyDetail(id: string): Promise<AnomalyDetail | null> {
  assertId(id);
  return getAnomaly(id);
}

export async function setAnomalyStatus(id: string, status: AnomalyStatus): Promise<AnomalyDetail | null> {
  assertId(id);
  if (!ANOMALY_STATUSES.includes(status)) throw new Error("Invalid status");
  return updateAnomalyStatus(id, status);
}

export async function requestExplanation(id: string): Promise<AnomalyDetail | null> {
  assertId(id);
  return generateExplanation(id);
}
