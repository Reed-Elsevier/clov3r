import "server-only";
import { z } from "zod";
import type { NewAnomaly } from "../schemas";
import { DEFAULT_RULE_CONFIG, derivePriority } from "./config";
import { invoiceFeaturesSchema, type InvoiceFeatures } from "./features";

const scoreResponseSchema = z.object({
  model_version: z.string().min(1),
  threshold: z.number().finite().min(-1).max(0),
  training_row_count: z.number().int().min(20),
  results: z.array(z.object({
    invoice_id: z.string().min(1),
    score: z.number().finite().min(-1).max(0),
    is_outlier: z.boolean(),
  }).strict()),
}).strict();

export interface ScoringOptions {
  url?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  batchSize?: number;
}

export async function scoreInvoices(features: InvoiceFeatures[], options: ScoringOptions = {}): Promise<NewAnomaly[]> {
  if (features.length === 0) return [];
  const url = options.url ?? process.env.ANOMALY_ENGINE_URL;
  if (!url) throw new Error("ANOMALY_ENGINE_URL is required for batch scoring");
  const endpoint = new URL(`${url.replace(/\/$/, "")}/score`);
  if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("Scoring URL must use HTTP or HTTPS");
  const batchSize = options.batchSize ?? 1000;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("Scoring batch size must be between 1 and 1000");
  const parsed = features.map((row) => invoiceFeaturesSchema.parse(row));
  if (new Set(parsed.map((row) => row.invoice_id)).size !== parsed.length) throw new Error("Feature invoice IDs must be unique");
  const anomalies: NewAnomaly[] = [];
  let modelVersion: string | undefined;
  for (let start = 0; start < parsed.length; start += batchSize) {
    const batch = parsed.slice(start, start + batchSize);
    const response = await (options.fetch ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features: batch }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Anomaly engine returned HTTP ${response.status}`);
    const scored = scoreResponseSchema.parse(await response.json());
    if (modelVersion && modelVersion !== scored.model_version) throw new Error("Model changed during batch scoring; retry against a single model version");
    modelVersion = scored.model_version;
    const byId = new Map(batch.map((row) => [row.invoice_id, row]));
    const seen = new Set<string>();
    for (const result of scored.results) {
      const row = byId.get(result.invoice_id);
      if (!row || seen.has(result.invoice_id) || result.is_outlier !== (result.score < scored.threshold)) throw new Error("Anomaly engine returned inconsistent scores or invoice IDs");
      seen.add(result.invoice_id);
      if (!result.is_outlier) continue;
      anomalies.push({
        invoice_id: row.invoice_id,
        method: "isolation_forest",
        category: "Multivariate outlier",
        priority: derivePriority(row.amount_usd, 0, DEFAULT_RULE_CONFIG),
        score: result.score,
        status: "Needs review",
        evidence: {
          summary: "The trained Isolation Forest identified an unusual numeric feature combination; human verification is required.",
          threshold: scored.threshold,
          modelVersion: scored.model_version,
          trainingRowCount: scored.training_row_count,
          features: { amountUsd: row.amount_usd, vendorAvgUsd: row.vendor_avg_usd, processingDays: row.processing_days, ocrConfidence: row.ocr_confidence, supplierExceptionRate: row.supplier_exception_rate },
        },
      });
    }
    if (seen.size !== batch.length) throw new Error("Anomaly engine omitted invoice scores");
  }
  return anomalies;
}