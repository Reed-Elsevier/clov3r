/**
 * View-model contract for the dashboard pages.
 *
 * These shapes are what the UI renders, independent of how they are produced.
 * Today they are filled from mock data (lib/data/mock); once
 * feat/data-schema-contract + feat/ingestion-api land, the same shapes are
 * produced from Postgres in lib/data/*.ts and no component needs to change.
 *
 * Enums below mirror PLAN-01's `anomalies` table. When lib/schemas exists,
 * replace these with re-exports from there.
 */

export const ANOMALY_PRIORITIES = ["High", "Medium", "Low"] as const;
export const ANOMALY_STATUSES = ["Needs review", "Investigating", "Resolved", "Dismissed"] as const;
export const ANOMALY_METHODS = ["rule", "statistical", "isolation_forest"] as const;

export type AnomalyPriority = (typeof ANOMALY_PRIORITIES)[number];
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];
export type AnomalyMethod = (typeof ANOMALY_METHODS)[number];

export type DataSource = "mock" | "live";

export interface KpiMetric {
  value: number;
  /** Value for the previous period, used to show period-over-period change. */
  previous?: number;
  /** Published reference value (e.g. 19.5% exception rate). */
  baseline?: number;
  /** Recent per-month values, oldest first, for the mini bar chart. */
  trend: number[];
}

export interface OverviewKpis {
  totalInvoices: KpiMetric;
  anomaliesDetected: KpiMetric;
  highPriorityExceptions: KpiMetric;
  /** Percent (0-100). */
  exceptionRate: KpiMetric;
  /** Percent (0-100). */
  invoicesWithoutPo: KpiMetric;
  /** Sum of amount_usd for flagged invoices — NOT confirmed loss or savings. */
  flaggedValueUsd: KpiMetric;
}

export interface MonthlyAnomalyPoint {
  /** YYYY-MM, bucketed by invoices.invoice_date. */
  month: string;
  invoices: number;
  anomalies: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface DepartmentFlaggedValue {
  departmentId: string;
  departmentName: string;
  flaggedInvoices: number;
  flaggedValueUsd: number;
  /** Percent (0-100) of the department's invoices that were flagged. */
  flaggedRate: number;
  topCategory: string;
  /** Monthly flagged counts, oldest first. */
  trend: number[];
}

export interface AmountBucket {
  /** Human-readable range label, e.g. "$1k–5k". */
  bucket: string;
  normal: number;
  anomalous: number;
}

export interface OverviewData {
  meta: { source: DataSource; generatedAt: string };
  kpis: OverviewKpis;
  anomaliesOverTime: MonthlyAnomalyPoint[];
  categoryDistribution: CategoryCount[];
  flaggedValueByDepartment: DepartmentFlaggedValue[];
  amountDistribution: AmountBucket[];
}

/* ---------- Page 2: Anomaly Investigation (PLAN-07) ---------- */

/** Freeform `anomalies.evidence` jsonb; keys differ per category (see PLAN-01 notes). */
export type Evidence = Record<string, string | number | boolean | null>;

export interface AnomalyListItem {
  anomalyId: string;
  invoiceId: string;
  supplierId: string;
  supplierName: string;
  category: string;
  method: AnomalyMethod;
  priority: AnomalyPriority;
  /** 0-1, higher = more anomalous. */
  score: number;
  /** One-line evidence summary for the table. */
  evidenceSummary: string;
  status: AnomalyStatus;
  amountUsd: number;
  invoiceDate: string;
  createdAt: string;
}

/** Mirrors PLAN-01 `anomaly_explanations`. */
export interface AnomalyExplanation {
  explanation: string;
  potentialImpact: string;
  recommendedActions: string[];
  preventiveMeasure: string;
  modelId: string;
  generatedAt: string;
}

export interface AnomalyDetail extends AnomalyListItem {
  evidence: Evidence;
  explanation: AnomalyExplanation | null;
}

export interface AnomalyFilters {
  q?: string;
  category?: string;
  priority?: AnomalyPriority;
  status?: AnomalyStatus;
  supplierId?: string;
  from?: string;
  to?: string;
}

/* ---------- Page 3: Workflow Intelligence (PLAN-08) ---------- */

export interface DepartmentExceptions {
  departmentId: string;
  departmentName: string;
  invoices: number;
  exceptions: number;
  /** Percent (0-100). */
  exceptionRate: number;
}

export interface SupplierExceptions {
  supplierId: string;
  supplierName: string;
  category: string;
  riskTier: "High" | "Medium" | "Low";
  invoices: number;
  exceptions: number;
  /** Percent (0-100). */
  exceptionRate: number;
  topExceptionType: string;
}

export interface ReviewTimeByType {
  exceptionType: string;
  count: number;
  /** resolved_at - raised_at, in hours. */
  medianHours: number;
  p90Hours: number;
  totalHours: number;
}

export interface DelayTrendPoint {
  month: string;
  /** Mean payments.days_vs_due; positive = paid late. */
  avgDaysVsDue: number;
  openExceptions: number;
  resolvedExceptions: number;
}

export interface WorkflowInsights {
  meta: { source: DataSource; generatedAt: string };
  byDepartment: DepartmentExceptions[];
  bySupplier: SupplierExceptions[];
  reviewTimeByType: ReviewTimeByType[];
  delayTrend: DelayTrendPoint[];
}

/* ---------- Page 4: Automation Opportunities (PLAN-09) ---------- */

export type Feasibility = "High" | "Medium" | "Low";

/** Raw, data-derived inputs for one candidate; scoring happens in lib/automation/score.ts. */
export interface AutomationCandidate {
  id: string;
  title: string;
  exceptionType: string;
  scope: string;
  proposedControl: string;
  /** Historical occurrences in the analysis window. */
  frequency: number;
  /** Sum of review hours spent on these occurrences. */
  effortHours: number;
  /** Flagged value affected, USD. */
  impactUsd: number;
  feasibility: Feasibility;
  /** Estimated share of occurrences the control would prevent (0-100). */
  estimatedReductionPct: number;
}

export interface ScoreBreakdown {
  frequency: number;
  effort: number;
  impact: number;
  feasibility: number;
  confidence: number;
}

export interface AutomationOpportunity extends AutomationCandidate {
  /** 0-100 weighted score. */
  score: number;
  breakdown: ScoreBreakdown;
  successCriterion: string;
}

export interface AutomationOpportunities {
  meta: { source: DataSource; generatedAt: string };
  opportunities: AutomationOpportunity[];
}

/* ---------- Page 5: Impact Simulator (PLAN-10) ---------- */

export interface SimulatorBaseline {
  meta: { source: DataSource; generatedAt: string };
  monthlyInvoices: number;
  /** Percent (0-100). */
  exceptionRate: number;
  /** Missing PO / missing-field exceptions per month. */
  missingFieldExceptionsPerMonth: number;
  avgProcessingDays: number;
  manualReviewsPerMonth: number;
  avgReviewMinutes: number;
  /** Assumed loaded cost of a reviewer hour — an assumption, not dataset data. */
  reviewCostPerHourUsd: number;
}

export interface SimulatorAssumptions {
  /** % of missing-field errors prevented by automated validation (0-100). */
  automatedValidationPct: number;
  /** % reduction in processing time (0-100). */
  processingTimeReductionPct: number;
  /** % fewer manual reviews for invoices that pass all checks (0-100). */
  manualReviewReductionPct: number;
}

export interface ProjectedValue {
  baseline: number;
  projected: number;
}

export interface SimulatorProjection {
  exceptionsPerMonth: ProjectedValue;
  exceptionRate: ProjectedValue;
  avgProcessingDays: ProjectedValue;
  reviewHoursPerMonth: ProjectedValue;
  reviewCostPerMonthUsd: ProjectedValue;
}
