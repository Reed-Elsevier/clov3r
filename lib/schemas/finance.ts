/**
 * Zod schemas for the 9 G_finance dataset tables.
 *
 * Keys are the exact Postgres/CSV column names (snake_case) so DB rows, API
 * JSON and CSV headers all share one vocabulary. Each schema's inferred type
 * is checked against the Drizzle row type in `./parity.ts`.
 */
import { z } from "zod";

import {
  decimalSchema,
  idSchema,
  integerSchema,
  isoDateSchema,
  timestampSchema,
} from "./common";
import {
  APPROVAL_LEVELS,
  CURRENCIES,
  INVOICE_CHANNELS,
  INVOICE_EXCEPTION_RESOLUTIONS,
  INVOICE_EXCEPTION_TYPES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PURCHASE_ORDER_STATUSES,
  SUPPLIER_CATEGORIES,
  SUPPLIER_ENROLLMENT_STATUSES,
  SUPPLIER_RISK_TIERS,
  SUPPLIER_STATUSES,
} from "./enums";

export const currencySchema = z.enum(CURRENCIES);

export const costCenterSchema = z.object({
  cost_center_id: idSchema,
  /** External ref to `departments` (outside v1 scope; not FK-enforced). */
  department_id: idSchema,
  /** External ref to `divisions`, e.g. `DIV01`..`DIV05`. */
  division_id: idSchema,
  cost_center_name: z.string(),
  /** External ref to `sites`, e.g. `SITE01`. */
  site_id: idSchema,
});
export type CostCenter = z.infer<typeof costCenterSchema>;

export const supplierSchema = z.object({
  supplier_id: idSchema,
  /** External ref to `business_entities` (not FK-enforced). */
  entity_id: idSchema,
  supplier_name: z.string(),
  category: z.enum(SUPPLIER_CATEGORIES),
  country: z.string(),
  /** Contractual payment terms in days (15–60). */
  payment_terms_days: integerSchema,
  risk_tier: z.enum(SUPPLIER_RISK_TIERS),
  /** Preferred-supplier flag. */
  preferred: z.boolean(),
  onboarded_date: isoDateSchema,
  status: z.enum(SUPPLIER_STATUSES),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const supplierEnrollmentRequestSchema = z.object({
  enrollment_request_id: idSchema,
  supplier_id: idSchema,
  /** External ref to `employees`. Aggregate use only — never rank individuals. */
  requested_by_employee_id: idSchema,
  submitted_at: timestampSchema,
  /** All onboarding documents were complete on first submission. */
  documents_complete_first_pass: z.boolean(),
  /** Tax documentation check passed. */
  tax_document_ok: z.boolean(),
  /** Bank details verification passed. */
  bank_details_ok: z.boolean(),
  /** Sanctions screening passed. */
  sanctions_screen_ok: z.boolean(),
  /** Days from submission to decision (fractional). */
  turnaround_days: decimalSchema,
  /** Null while the request is still pending. */
  decided_at: timestampSchema.nullable(),
  status: z.enum(SUPPLIER_ENROLLMENT_STATUSES),
});
export type SupplierEnrollmentRequest = z.infer<
  typeof supplierEnrollmentRequestSchema
>;

export const purchaseOrderSchema = z.object({
  po_id: idSchema,
  supplier_id: idSchema,
  cost_center_id: idSchema,
  /** External ref to `employees`. Aggregate use only. */
  requester_employee_id: idSchema,
  /** External ref to `employees`. Aggregate use only. */
  approver_employee_id: idSchema,
  po_date: isoDateSchema,
  currency: currencySchema,
  /** PO value in the PO's own `currency` (not USD). */
  po_amount: decimalSchema,
  status: z.enum(PURCHASE_ORDER_STATUSES),
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const invoiceSchema = z.object({
  invoice_id: idSchema,
  supplier_id: idSchema,
  /** Null for invoices raised without a PO (~6.1% — a published baseline KPI). */
  po_id: idSchema.nullable(),
  currency: currencySchema,
  invoice_date: isoDateSchema,
  /** Amount before tax, in `currency`. */
  net_amount: decimalSchema,
  /** Tax amount, in `currency`. */
  tax_amount: decimalSchema,
  /** `net_amount + tax_amount`, in `currency`. */
  gross_amount: decimalSchema,
  /** Gross amount converted to USD at a fixed synthetic FX rate. Use for cross-currency comparisons. */
  amount_usd: decimalSchema,
  /** Supplier-issued invoice number (not unique across suppliers). */
  invoice_number: z.string(),
  /** When the invoice arrived in AP. */
  received_at: timestampSchema,
  due_date: isoDateSchema,
  /** Required approval authority by `amount_usd`: L1 < 10k, L2 < 50k, L3 >= 50k. */
  approval_level: z.enum(APPROVAL_LEVELS),
  /** Intake channel. */
  channel: z.enum(INVOICE_CHANNELS),
  /** OCR/IDP extraction confidence (0–1). Only populated for `Email` invoices. */
  ocr_confidence: decimalSchema.nullable(),
  /** External ref to `employees`. Aggregate workload stats only — never rank individuals. */
  processor_employee_id: idSchema,
  status: z.enum(INVOICE_STATUSES),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceLineSchema = z.object({
  invoice_line_id: idSchema,
  invoice_id: idSchema,
  /** 1-based line position within the invoice. */
  line_no: integerSchema,
  description: z.string(),
  quantity: decimalSchema,
  /** Unit price in the invoice's `currency`. */
  unit_price: decimalSchema,
  /** `quantity * unit_price`, in the invoice's `currency`. Lines sum to `invoices.net_amount`. */
  line_amount: decimalSchema,
  /** General-ledger account, e.g. `6100 Software`. */
  gl_account: z.string(),
  cost_center_id: idSchema,
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/**
 * Exceptions already flagged upstream by the dataset — ground truth for
 * validating our own detectors (precision/recall).
 */
export const invoiceExceptionSchema = z.object({
  exception_id: idSchema,
  invoice_id: idSchema,
  exception_type: z.enum(INVOICE_EXCEPTION_TYPES),
  raised_at: timestampSchema,
  /** Null while the exception is still open (~5.4%). */
  resolved_at: timestampSchema.nullable(),
  /** External ref to `employees`. Aggregate use only. */
  resolver_employee_id: idSchema,
  /** Null while the exception is still open. */
  resolution: z.enum(INVOICE_EXCEPTION_RESOLUTIONS).nullable(),
});
export type InvoiceException = z.infer<typeof invoiceExceptionSchema>;

export const paymentSchema = z.object({
  payment_id: idSchema,
  invoice_id: idSchema,
  paid_at: timestampSchema,
  /** Amount paid, in `currency`. */
  amount: decimalSchema,
  currency: currencySchema,
  method: z.enum(PAYMENT_METHODS),
  /** Batch payment run identifier, e.g. `RUN-202613`. */
  payment_run_id: z.string(),
  /** Paid date minus due date in days: negative = early, positive = late. */
  days_vs_due: integerSchema,
});
export type Payment = z.infer<typeof paymentSchema>;

export const opexBudgetVsActualSchema = z.object({
  opex_row_id: idSchema,
  cost_center_id: idSchema,
  division_id: idSchema,
  /** First day of the month the row covers. */
  month: isoDateSchema,
  budget_php: decimalSchema,
  actual_php: decimalSchema,
  /** `actual_php - budget_php` (positive = over budget). */
  variance_php: decimalSchema,
  /** Variance as a percentage of budget (e.g. `15.06` = 15.06%). */
  variance_pct: decimalSchema,
});
export type OpexBudgetVsActual = z.infer<typeof opexBudgetVsActualSchema>;
