import type {
  AnomalyDetail,
  AnomalyFilters,
  AnomalyListItem,
  AnomalyStatus,
  DataSource,
} from "@/lib/types/dashboard";
import { buildMockAnomalies, mockExplain } from "./mock/anomalies";

/**
 * Data seam for Page 2 (PLAN-07).
 * TODO(feat/data-schema-contract, feat/anomaly-rules): replace the in-memory store with Drizzle
 * queries on `anomalies` (join `invoices`, `suppliers`, `anomaly_explanations`).
 * TODO(feat/ai-explanations): replace mockExplain with the Bedrock explain call.
 */
export const anomaliesSource: DataSource = "mock";
const store: AnomalyDetail[] = buildMockAnomalies();

function toListItem(a: AnomalyDetail): AnomalyListItem {
  const item: Partial<AnomalyDetail> = { ...a };
  delete item.evidence;
  delete item.explanation;
  return item as AnomalyListItem;
}

export async function listAnomalies(filters: AnomalyFilters = {}): Promise<AnomalyListItem[]> {
  const q = filters.q?.trim().toLowerCase();
  return store
    .filter(
      (a) =>
        (!q || [a.invoiceId, a.supplierName, a.category, a.anomalyId].some((v) => v.toLowerCase().includes(q))) &&
        (!filters.category || a.category === filters.category) &&
        (!filters.priority || a.priority === filters.priority) &&
        (!filters.status || a.status === filters.status) &&
        (!filters.supplierId || a.supplierId === filters.supplierId) &&
        (!filters.from || a.invoiceDate >= filters.from) &&
        (!filters.to || a.invoiceDate <= filters.to),
    )
    .map(toListItem);
}

export async function getAnomaly(anomalyId: string): Promise<AnomalyDetail | null> {
  return store.find((a) => a.anomalyId === anomalyId) ?? null;
}

export async function updateAnomalyStatus(anomalyId: string, status: AnomalyStatus): Promise<AnomalyDetail | null> {
  const a = store.find((x) => x.anomalyId === anomalyId);
  if (!a) return null;
  a.status = status;
  return a;
}

export async function generateExplanation(anomalyId: string): Promise<AnomalyDetail | null> {
  const a = store.find((x) => x.anomalyId === anomalyId);
  if (!a) return null;
  a.explanation ??= { ...mockExplain(a), generatedAt: new Date().toISOString() };
  return a;
}
