/**
 * Drizzle schema for InvoiceIQ AI.
 *
 * The 9 G_finance tables mirror `dataset/_docs/03_data_dictionary.md` exactly
 * (column names, order and types) so `dataset/G_finance/*.csv` can be loaded
 * as-is. Type mapping:
 *   string    -> text
 *   integer   -> integer
 *   decimal   -> numeric (unconstrained precision, exposed as JS number)
 *   boolean   -> boolean
 *   date      -> date      (exposed as 'YYYY-MM-DD' string)
 *   timestamp -> timestamp (no tz; dataset values are naive local times,
 *                           exposed as 'YYYY-MM-DD HH:MM:SS' string)
 *
 * Foreign keys *between* the 9 finance tables are enforced (the dataset's
 * validation report shows zero FK violations). References to tables outside
 * the v1 scope (departments, divisions, sites, business_entities, employees)
 * are plain text columns with no constraint.
 *
 * Categorical columns are `text` in Postgres (no DB enum) but typed in TS
 * via the shared value lists in `lib/schemas/enums.ts`.
 *
 * Relative imports only: this file is also loaded by drizzle-kit outside of
 * the Next.js/tsconfig path-alias resolver.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  ANOMALY_METHODS,
  ANOMALY_PRIORITIES,
  ANOMALY_STATUSES,
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
} from "../schemas/enums";

const decimal = () => numeric({ mode: "number" });
const datasetDate = () => date({ mode: "string" });
const datasetTimestamp = () => timestamp({ mode: "string" });

// ---------------------------------------------------------------------------
// G_finance dataset tables
// ---------------------------------------------------------------------------

export const costCenters = pgTable("cost_centers", {
  cost_center_id: text().primaryKey(),
  department_id: text().notNull(),
  division_id: text().notNull(),
  cost_center_name: text().notNull(),
  site_id: text().notNull(),
});

export const suppliers = pgTable("suppliers", {
  supplier_id: text().primaryKey(),
  entity_id: text().notNull(),
  supplier_name: text().notNull(),
  category: text({ enum: SUPPLIER_CATEGORIES }).notNull(),
  country: text().notNull(),
  payment_terms_days: integer().notNull(),
  risk_tier: text({ enum: SUPPLIER_RISK_TIERS }).notNull(),
  preferred: boolean().notNull(),
  onboarded_date: datasetDate().notNull(),
  status: text({ enum: SUPPLIER_STATUSES }).notNull(),
});

export const supplierEnrollmentRequests = pgTable(
  "supplier_enrollment_requests",
  {
    enrollment_request_id: text().primaryKey(),
    supplier_id: text()
      .notNull()
      .references(() => suppliers.supplier_id),
    requested_by_employee_id: text().notNull(),
    submitted_at: datasetTimestamp().notNull(),
    documents_complete_first_pass: boolean().notNull(),
    tax_document_ok: boolean().notNull(),
    bank_details_ok: boolean().notNull(),
    sanctions_screen_ok: boolean().notNull(),
    turnaround_days: decimal().notNull(),
    decided_at: datasetTimestamp(),
    status: text({ enum: SUPPLIER_ENROLLMENT_STATUSES }).notNull(),
  },
  (t) => [index("supplier_enrollment_requests_supplier_id_idx").on(t.supplier_id)],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    po_id: text().primaryKey(),
    supplier_id: text()
      .notNull()
      .references(() => suppliers.supplier_id),
    cost_center_id: text()
      .notNull()
      .references(() => costCenters.cost_center_id),
    requester_employee_id: text().notNull(),
    approver_employee_id: text().notNull(),
    po_date: datasetDate().notNull(),
    currency: text({ enum: CURRENCIES }).notNull(),
    po_amount: decimal().notNull(),
    status: text({ enum: PURCHASE_ORDER_STATUSES }).notNull(),
  },
  (t) => [
    index("purchase_orders_supplier_id_idx").on(t.supplier_id),
    index("purchase_orders_cost_center_id_idx").on(t.cost_center_id),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    invoice_id: text().primaryKey(),
    supplier_id: text()
      .notNull()
      .references(() => suppliers.supplier_id),
    po_id: text().references(() => purchaseOrders.po_id),
    currency: text({ enum: CURRENCIES }).notNull(),
    invoice_date: datasetDate().notNull(),
    net_amount: decimal().notNull(),
    tax_amount: decimal().notNull(),
    gross_amount: decimal().notNull(),
    amount_usd: decimal().notNull(),
    invoice_number: text().notNull(),
    received_at: datasetTimestamp().notNull(),
    due_date: datasetDate().notNull(),
    approval_level: text({ enum: APPROVAL_LEVELS }).notNull(),
    channel: text({ enum: INVOICE_CHANNELS }).notNull(),
    ocr_confidence: decimal(),
    processor_employee_id: text().notNull(),
    status: text({ enum: INVOICE_STATUSES }).notNull(),
  },
  (t) => [
    index("invoices_supplier_id_idx").on(t.supplier_id),
    index("invoices_po_id_idx").on(t.po_id),
    index("invoices_invoice_date_idx").on(t.invoice_date),
    index("invoices_status_idx").on(t.status),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    invoice_line_id: text().primaryKey(),
    invoice_id: text()
      .notNull()
      .references(() => invoices.invoice_id),
    line_no: integer().notNull(),
    description: text().notNull(),
    quantity: decimal().notNull(),
    unit_price: decimal().notNull(),
    line_amount: decimal().notNull(),
    gl_account: text().notNull(),
    cost_center_id: text()
      .notNull()
      .references(() => costCenters.cost_center_id),
  },
  (t) => [
    index("invoice_lines_invoice_id_idx").on(t.invoice_id),
    index("invoice_lines_cost_center_id_idx").on(t.cost_center_id),
  ],
);

export const invoiceExceptions = pgTable(
  "invoice_exceptions",
  {
    exception_id: text().primaryKey(),
    invoice_id: text()
      .notNull()
      .references(() => invoices.invoice_id),
    exception_type: text({ enum: INVOICE_EXCEPTION_TYPES }).notNull(),
    raised_at: datasetTimestamp().notNull(),
    resolved_at: datasetTimestamp(),
    resolver_employee_id: text().notNull(),
    resolution: text({ enum: INVOICE_EXCEPTION_RESOLUTIONS }),
  },
  (t) => [
    index("invoice_exceptions_invoice_id_idx").on(t.invoice_id),
    index("invoice_exceptions_exception_type_idx").on(t.exception_type),
  ],
);

export const payments = pgTable(
  "payments",
  {
    payment_id: text().primaryKey(),
    invoice_id: text()
      .notNull()
      .references(() => invoices.invoice_id),
    paid_at: datasetTimestamp().notNull(),
    amount: decimal().notNull(),
    currency: text({ enum: CURRENCIES }).notNull(),
    method: text({ enum: PAYMENT_METHODS }).notNull(),
    payment_run_id: text().notNull(),
    days_vs_due: integer().notNull(),
  },
  (t) => [index("payments_invoice_id_idx").on(t.invoice_id)],
);

export const opexBudgetVsActual = pgTable(
  "opex_budget_vs_actual",
  {
    opex_row_id: text().primaryKey(),
    cost_center_id: text()
      .notNull()
      .references(() => costCenters.cost_center_id),
    division_id: text().notNull(),
    month: datasetDate().notNull(),
    budget_php: decimal().notNull(),
    actual_php: decimal().notNull(),
    variance_php: decimal().notNull(),
    variance_pct: decimal().notNull(),
  },
  (t) => [index("opex_budget_vs_actual_cost_center_id_idx").on(t.cost_center_id)],
);

// ---------------------------------------------------------------------------
// App-native tables
// ---------------------------------------------------------------------------

export const anomalyMethodEnum = pgEnum("anomaly_method", ANOMALY_METHODS);
export const anomalyPriorityEnum = pgEnum("anomaly_priority", ANOMALY_PRIORITIES);
export const anomalyStatusEnum = pgEnum("anomaly_status", ANOMALY_STATUSES);

/** Freeform per-category evidence; see `lib/schemas/anomalies.ts` for keys. */
export type AnomalyEvidence = Record<string, unknown>;

export const anomalies = pgTable(
  "anomalies",
  {
    anomaly_id: uuid().primaryKey().defaultRandom(),
    invoice_id: text()
      .notNull()
      .references(() => invoices.invoice_id, { onDelete: "cascade" }),
    method: anomalyMethodEnum().notNull(),
    category: text().notNull(),
    priority: anomalyPriorityEnum().notNull(),
    score: doublePrecision(),
    evidence: jsonb().$type<AnomalyEvidence>().notNull(),
    status: anomalyStatusEnum().notNull().default("Needs review"),
    created_at: timestamp({ withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One row per (invoice, detector method, category) so detector re-runs can upsert.
    uniqueIndex("anomalies_invoice_method_category_uq").on(
      t.invoice_id,
      t.method,
      t.category,
    ),
    index("anomalies_status_idx").on(t.status),
    index("anomalies_priority_idx").on(t.priority),
    index("anomalies_category_idx").on(t.category),
    check(
      "anomalies_evidence_is_object",
      sql`jsonb_typeof(${t.evidence}) = 'object'`,
    ),
  ],
);

export const anomalyExplanations = pgTable(
  "anomaly_explanations",
  {
    anomaly_id: uuid()
      .primaryKey()
      .references(() => anomalies.anomaly_id, { onDelete: "cascade" }),
    explanation: text().notNull(),
    evidence_summary: text().notNull(),
    potential_impact: text().notNull(),
    recommended_actions: jsonb().$type<string[]>().notNull(),
    preventive_measure: text().notNull(),
    requires_human_review: boolean().notNull().default(true),
    model_id: text().notNull(),
    generated_at: timestamp({ withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "anomaly_explanations_recommended_actions_is_array",
      sql`jsonb_typeof(${t.recommended_actions}) = 'array'`,
    ),
  ],
);
