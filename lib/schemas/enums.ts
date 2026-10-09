/**
 * Allowed values for categorical columns.
 *
 * Dataset values are copied verbatim from
 * `dataset/_docs/03_data_dictionary.md` (G_finance domain). These arrays are
 * shared by the Drizzle schema (TS-level column typing) and the Zod schemas
 * (runtime validation), so the two can never drift apart.
 */

// ---------------------------------------------------------------------------
// Dataset (G_finance) enums
// ---------------------------------------------------------------------------

export const CURRENCIES = ["EUR", "GBP", "JPY", "PHP", "USD"] as const;

export const SUPPLIER_CATEGORIES = [
  "Content Vendors",
  "Data Providers",
  "Events Services",
  "Facilities",
  "IT Services",
  "Professional Services",
  "Software",
  "Travel",
] as const;

export const SUPPLIER_RISK_TIERS = ["High", "Medium", "Low"] as const;

export const SUPPLIER_STATUSES = ["Active", "Blocked", "Inactive"] as const;

export const SUPPLIER_ENROLLMENT_STATUSES = [
  "Approved",
  "Approved - update",
  "Approved after remediation",
  "Pending",
  "Rejected - duplicate",
] as const;

export const PURCHASE_ORDER_STATUSES = [
  "Cancelled",
  "Closed",
  "Open",
  "Partially invoiced",
] as const;

/** L1 < 10k USD, L2 < 50k USD, L3 >= 50k USD (based on `amount_usd`). */
export const APPROVAL_LEVELS = [
  "L1 - Team Lead",
  "L2 - Manager",
  "L3 - Director",
] as const;

export const INVOICE_CHANNELS = ["EDI", "Email", "Supplier portal"] as const;

export const INVOICE_STATUSES = [
  "Approved",
  "On hold - exception",
  "Paid",
] as const;

export const INVOICE_EXCEPTION_TYPES = [
  "Bank details changed",
  "Duplicate suspected",
  "Missing PO",
  "Missing goods receipt",
  "Price mismatch",
  "Quantity mismatch",
  "Tax error",
] as const;

export const INVOICE_EXCEPTION_RESOLUTIONS = [
  "Approved by budget owner",
  "Corrected and approved",
  "Credit note requested",
  "PO amended",
  "Rejected to supplier",
] as const;

export const PAYMENT_METHODS = [
  "Bank transfer",
  "Check",
  "Virtual card",
  "Wire",
] as const;

// ---------------------------------------------------------------------------
// App-native enums (anomalies)
// ---------------------------------------------------------------------------

export const ANOMALY_METHODS = [
  "rule",
  "statistical",
  "isolation_forest",
] as const;

export const ANOMALY_PRIORITIES = ["High", "Medium", "Low"] as const;

/** Human-in-the-loop workflow state. Detectors always insert `Needs review`. */
export const ANOMALY_STATUSES = [
  "Needs review",
  "Investigating",
  "Resolved",
  "Dismissed",
] as const;

/**
 * Known anomaly categories. `anomalies.category` is free text in the DB so new
 * detectors can add categories without a migration; prefer these values so
 * dashboards group consistently. See `lib/schemas/anomalies.ts` for the
 * evidence keys expected per category.
 */
export const KNOWN_ANOMALY_CATEGORIES = [
  // Business rules (feat/anomaly-rules)
  "Duplicate invoice",
  "Missing PO",
  "Price/quantity mismatch",
  "Tax/total error",
  "Overdue invoice",
  "Unusual vendor transaction",
  // Statistical outliers
  "Unusually high amount",
  "Unexpected payment timing",
  // Isolation Forest (feat/anomaly-engine-ml)
  "Multivariate outlier",
] as const;

export type Currency = (typeof CURRENCIES)[number];
export type SupplierCategory = (typeof SUPPLIER_CATEGORIES)[number];
export type SupplierRiskTier = (typeof SUPPLIER_RISK_TIERS)[number];
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];
export type SupplierEnrollmentStatus =
  (typeof SUPPLIER_ENROLLMENT_STATUSES)[number];
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];
export type InvoiceChannel = (typeof INVOICE_CHANNELS)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type InvoiceExceptionType = (typeof INVOICE_EXCEPTION_TYPES)[number];
export type InvoiceExceptionResolution =
  (typeof INVOICE_EXCEPTION_RESOLUTIONS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type AnomalyMethod = (typeof ANOMALY_METHODS)[number];
export type AnomalyPriority = (typeof ANOMALY_PRIORITIES)[number];
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];
export type KnownAnomalyCategory = (typeof KNOWN_ANOMALY_CATEGORIES)[number];
