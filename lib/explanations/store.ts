import { eq } from "drizzle-orm";

import { anomaliesSource, getAnomalyRow, getExplanationRow, saveExplanationRow } from "@/lib/data/anomalies";
import { getDb } from "@/lib/db/client";
import { anomalies, anomalyExplanations } from "@/lib/db/schema";
import type { Anomaly, AnomalyExplanation } from "@/lib/schemas";

export interface ExplanationStore {
  getAnomaly(anomalyId: string): Promise<Anomaly | null>;
  getExplanation(anomalyId: string): Promise<AnomalyExplanation | null>;
  saveExplanation(row: AnomalyExplanation): Promise<AnomalyExplanation>;
}

/** Postgres `anomalies` / `anomaly_explanations` (lib/db/schema.ts). */
export const dbStore: ExplanationStore = {
  async getAnomaly(anomalyId) {
    const [row] = await getDb().select().from(anomalies).where(eq(anomalies.anomaly_id, anomalyId)).limit(1);
    return row ?? null;
  },
  async getExplanation(anomalyId) {
    const [row] = await getDb()
      .select()
      .from(anomalyExplanations)
      .where(eq(anomalyExplanations.anomaly_id, anomalyId))
      .limit(1);
    return row ?? null;
  },
  async saveExplanation(row) {
    const set: Partial<AnomalyExplanation> = { ...row };
    delete set.anomaly_id;
    const [saved] = await getDb()
      .insert(anomalyExplanations)
      .values(row)
      .onConflictDoUpdate({ target: anomalyExplanations.anomaly_id, set })
      .returning();
    return saved;
  },
};

/** In-memory dashboard store (lib/data/anomalies.ts) used while anomalies are mock fixtures. */
export const memoryStore: ExplanationStore = {
  getAnomaly: getAnomalyRow,
  getExplanation: getExplanationRow,
  saveExplanation: saveExplanationRow,
};

/** Follows the same switch as the dashboard so generated explanations show up where anomalies are listed. */
export function explanationStore(): ExplanationStore {
  return anomaliesSource === "live" ? dbStore : memoryStore;
}
