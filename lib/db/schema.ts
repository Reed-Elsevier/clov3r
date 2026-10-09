/**
 * Drizzle schema for InvoiceIQ AI.
 *
 * The 9 G_finance tables mirror `dataset/_docs/03_data_dictionary.md` exactly
 * (column names, order and types) so `dataset/G_finance/*.csv` can be loaded
 * as-is into SQLite. Type mapping:
 *   string    -> text
 *   integer   -> integer
 *   decimal   -> real
 *   boolean   -> integer 0/1 (exposed as JS boolean)
 *   date      -> date      (text affinity in practice; 'YYYY-MM-DD')
 *   timestamp -> timestamp (naive local time; 'YYYY-MM-DD HH:MM:SS')
 *
 * Foreign keys *between* the 9 finance tables are enforced (the dataset's
 * validation report shows zero FK violations). References to tables outside
 * the v1 scope (departments, divisions, sites, business_entities, employees)
 * are plain text columns with no constraint.
 *
 * Categorical columns are plain `text` but typed in TS via the shared value
 * lists in `lib/schemas/enums.ts`.
 *
 * Relative imports only: this file is also loaded by drizzle-kit outside of
 * the Next.js/tsconfig path-alias resolver.
 */
import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

const decimal = () => real();
const boolean = () => integer({ mode: "boolean" });
// Declared SQL types let lib/ingestion/convert.ts tell dates from timestamps.
const datasetDate = customType<{ data: string; driverData: string }>({ dataType: () => "date" });
const datasetTimestamp = customType<{ data: string; driverData: string }>({ dataType: () => "timestamp" });
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

// ---------------------------------------------------------------------------
// G_finance dataset tables
// ---------------------------------------------------------------------------

export const costCenters = sqliteTable("cost_centers", {
  cost_center_id: text().primaryKey(),
  department_id: text().notNull(),
  division_id: text().notNull(),
  cost_center_name: text().notNull(),
  site_id: text().notNull(),
});

export const suppliers = sqliteTable("suppliers", {
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

export const supplierEnrollmentRequests = sqliteTable(
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

export const purchaseOrders = sqliteTable(
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

export const invoices = sqliteTable(
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

export const invoiceLines = sqliteTable(
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

export const invoiceExceptions = sqliteTable(
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

export const payments = sqliteTable(
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

export const opexBudgetVsActual = sqliteTable(
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

/** Freeform per-category evidence; see `lib/schemas/anomalies.ts` for keys. */
export type AnomalyEvidence = Record<string, unknown>;

export const anomalies = sqliteTable(
  "anomalies",
  {
    anomaly_id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    invoice_id: text()
      .notNull()
      .references(() => invoices.invoice_id, { onDelete: "cascade" }),
    method: text({ enum: ANOMALY_METHODS }).notNull(),
    category: text().notNull(),
    priority: text({ enum: ANOMALY_PRIORITIES }).notNull(),
    score: real(),
    evidence: text({ mode: "json" }).$type<AnomalyEvidence>().notNull(),
    status: text({ enum: ANOMALY_STATUSES }).notNull().default("Needs review"),
    created_at: text().notNull().default(nowIso),
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
      sql`json_type(${t.evidence}) = 'object'`,
    ),
  ],
);

export const anomalyExplanations = sqliteTable(
  "anomaly_explanations",
  {
    anomaly_id: text()
      .primaryKey()
      .references(() => anomalies.anomaly_id, { onDelete: "cascade" }),
    explanation: text().notNull(),
    evidence_summary: text().notNull(),
    potential_impact: text().notNull(),
    recommended_actions: text({ mode: "json" }).$type<string[]>().notNull(),
    preventive_measure: text().notNull(),
    requires_human_review: boolean().notNull().default(true),
    model_id: text().notNull(),
    generated_at: text().notNull().default(nowIso),
  },
  (t) => [
    check(
      "anomaly_explanations_recommended_actions_is_array",
      sql`json_type(${t.recommended_actions}) = 'array'`,
    ),
  ],
);
