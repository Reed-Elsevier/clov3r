import {
  mockAnomalies,
  mockAnomalyExplanations,
  mockInvoices,
  mockSuppliers,
} from "@/lib/fixtures";
import type {
  Anomaly,
  AnomalyDetail,
  AnomalyExplanation,
  AnomalyListItem,
  AnomalyStatus,
} from "@/lib/schemas";
import type { AnomalyFilters, DataSource } from "@/lib/types/dashboard";

/**
 * Data seam for Page 2 (PLAN-07). Shapes are the shared contract in lib/schemas/api.ts.
 * TODO(feat/ingestion-api, feat/anomaly-rules): replace the in-memory store with Drizzle queries
 * on `anomalies` joined to `invoices`, `suppliers` and `anomaly_explanations` (lib/db).
 * TODO(feat/ai-explanations): replace buildMockExplanation with the Bedrock call.
 */
export const anomaliesSource: DataSource = "mock";

// Cloned so review-status changes don't mutate the shared fixtures.
const anomalies: Anomaly[] = structuredClone(mockAnomalies);
const explanations: AnomalyExplanation[] = structuredClone(mockAnomalyExplanations);

function invoiceFor(a: Anomaly) {
  return mockInvoices.find((i) => i.invoice_id === a.invoice_id) ?? null;
}

function toListItem(a: Anomaly): AnomalyListItem | null {
  const invoice = invoiceFor(a);
  const supplier = invoice && mockSuppliers.find((s) => s.supplier_id === invoice.supplier_id);
  if (!invoice || !supplier) return null;
  return {
    ...a,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    amount_usd: invoice.amount_usd,
    supplier_id: supplier.supplier_id,
    supplier_name: supplier.supplier_name,
    has_explanation: explanations.some((e) => e.anomaly_id === a.anomaly_id),
  };
}

export async function listAnomalies(filters: AnomalyFilters = {}): Promise<AnomalyListItem[]> {
  const q = filters.q?.trim().toLowerCase();
  return anomalies
    .map(toListItem)
    .filter((a): a is AnomalyListItem => a !== null)
    .filter(
      (a) =>
        (!q ||
          [a.invoice_id, a.invoice_number, a.supplier_name, a.category].some((v) => v.toLowerCase().includes(q))) &&
        (!filters.category || a.category === filters.category) &&
        (!filters.priority || a.priority === filters.priority) &&
        (!filters.status || a.status === filters.status) &&
        (!filters.supplier_id || a.supplier_id === filters.supplier_id) &&
        (!filters.from || a.invoice_date >= filters.from) &&
        (!filters.to || a.invoice_date <= filters.to),
    )
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
}

export async function getAnomalyDetail(anomalyId: string): Promise<AnomalyDetail | null> {
  const anomaly = anomalies.find((a) => a.anomaly_id === anomalyId);
  const invoice = anomaly && invoiceFor(anomaly);
  const supplier = invoice && mockSuppliers.find((s) => s.supplier_id === invoice.supplier_id);
  if (!anomaly || !invoice || !supplier) return null;
  return {
    anomaly,
    invoice,
    supplier,
    explanation: explanations.find((e) => e.anomaly_id === anomalyId) ?? null,
  };
}

export async function updateAnomalyStatus(anomalyId: string, status: AnomalyStatus): Promise<AnomalyDetail | null> {
  const anomaly = anomalies.find((a) => a.anomaly_id === anomalyId);
  if (!anomaly) return null;
  anomaly.status = status;
  return getAnomalyDetail(anomalyId);
}

export async function generateExplanation(anomalyId: string): Promise<AnomalyDetail | null> {
  const detail = await getAnomalyDetail(anomalyId);
  if (!detail) return null;
  if (!detail.explanation) explanations.push(buildMockExplanation(detail));
  return getAnomalyDetail(anomalyId);
}

// Template only restates evidence.summary, mirroring the rule that explanations cite verified evidence.
function buildMockExplanation({ anomaly, invoice, supplier }: AnomalyDetail): AnomalyExplanation {
  const summary = typeof anomaly.evidence.summary === "string" ? anomaly.evidence.summary : anomaly.category;
  return {
    anomaly_id: anomaly.anomaly_id,
    explanation: `Invoice ${invoice.invoice_id} (${invoice.invoice_number}) from ${supplier.supplier_name} was flagged as "${anomaly.category}". ${summary}.`,
    evidence_summary: summary,
    potential_impact: `The invoice (USD ${invoice.amount_usd.toLocaleString("en-US")}) may need additional verification before approval or payment. This is not evidence of fraud.`,
    recommended_actions: [
      "Compare the invoice against the purchase order and goods receipt.",
      `Confirm the details with ${supplier.supplier_name}.`,
      "Record the review outcome and update the status.",
    ],
    preventive_measure: `Add an automated "${anomaly.category}" check at invoice intake.`,
    requires_human_review: true,
    model_id: "mock-explainer",
    generated_at: new Date().toISOString(),
  };
}
