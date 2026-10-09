/**
 * Shared API response shapes, so dashboard pages can be built against mock
 * data before the routes (`feat/ingestion-api`, `feat/anomaly-rules`) land.
 */
import { z } from "zod";

import { anomalyExplanationSchema, anomalySchema } from "./anomalies";
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
