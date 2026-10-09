/**
 * Shared API response shapes, so dashboard pages can be built against mock
 * data before the routes (`feat/ingestion-api`, `feat/anomaly-rules`) land.
 */
import { z } from "zod";

import { anomalyExplanationSchema, anomalySchema } from "./anomalies";
import { idSchema, isoDateSchema, timestampSchema } from "./common";
import { INVOICE_STATUSES } from "./enums";
import { invoiceSchema, supplierSchema } from "./finance";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Wraps a list-item schema in the standard paginated envelope. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    /** 1-based page index. */
    page: z.number().int().min(1),
    page_size: z.number().int().min(1),
    /** Total matching rows across all pages. */
    total: z.number().int().min(0),
  });
}
export type Paginated<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};

/** Row in the Anomaly Investigation table (`GET /api/anomalies`). */
export const anomalyListItemSchema = anomalySchema.extend({
  invoice_number: invoiceSchema.shape.invoice_number,
  invoice_date: invoiceSchema.shape.invoice_date,
  amount_usd: invoiceSchema.shape.amount_usd,
  supplier_id: supplierSchema.shape.supplier_id,
  supplier_name: supplierSchema.shape.supplier_name,
  /** Whether a Bedrock explanation has been generated yet. */
  has_explanation: z.boolean(),
});
export type AnomalyListItem = z.infer<typeof anomalyListItemSchema>;

export const anomalyListResponseSchema = paginatedSchema(anomalyListItemSchema);
export type AnomalyListResponse = z.infer<typeof anomalyListResponseSchema>;

/** Detail panel payload (`GET /api/anomalies/[id]`). */
export const anomalyDetailSchema = z.object({
  anomaly: anomalySchema,
  invoice: invoiceSchema,
  supplier: supplierSchema,
  /** Null until `feat/ai-explanations` has generated one. */
  explanation: anomalyExplanationSchema.nullable(),
});
export type AnomalyDetail = z.infer<typeof anomalyDetailSchema>;

/** Query string for `GET /api/invoices` (all filters optional, combined with AND). */
export const invoiceListQuerySchema = paginationQuerySchema.extend({
  supplier_id: idSchema.optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  /** Matches invoices with at least one line on this cost center. */
  cost_center_id: idSchema.optional(),
  /** Inclusive `invoice_date` range. */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceListResponseSchema = paginatedSchema(invoiceSchema);
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;

/** Published Track 6 baselines (dataset/_docs/05_hackathon_package.md). */
export const PUBLISHED_BASELINES = {
  exception_rate_pct: 19.5,
  invoices_without_po_pct: 6.1,
} as const;

/** Headline KPIs (`GET /api/metrics`). Percentages are 0–100. */
export const metricsResponseSchema = z.object({
  total_invoices: z.number().int().min(0),
  /** Invoices with at least one `invoice_exceptions` row. */
  invoices_with_exceptions: z.number().int().min(0),
  exception_rate_pct: z.number().min(0).max(100),
  invoices_without_po: z.number().int().min(0),
  invoices_without_po_pct: z.number().min(0).max(100),
  /** Exceptions with `resolved_at` still null. */
  open_exceptions: z.number().int().min(0),
  /** Mean days from `received_at` to first payment, over paid invoices; null if none paid. */
  avg_processing_days: z.number().nullable(),
  /** Detected anomalies (all statuses). */
  anomalies_detected: z.number().int().min(0),
  high_priority_anomalies: z.number().int().min(0),
  /** Sum of `amount_usd` over distinct invoices with an open anomaly — NOT confirmed loss or savings. */
  flagged_value_usd: z.number().min(0),
  baselines: z.object({
    exception_rate_pct: z.number(),
    invoices_without_po_pct: z.number(),
  }),
  generated_at: timestampSchema,
});
export type MetricsResponse = z.infer<typeof metricsResponseSchema>;
