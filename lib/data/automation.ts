import { sql } from "drizzle-orm";

import { scoreOpportunities } from "@/lib/automation/score";
import type { InvoiceExceptionType } from "@/lib/schemas";
import type { AutomationCandidate, AutomationOpportunities, Feasibility } from "@/lib/types/dashboard";
import { cachedAggregate, departmentNames, JOIN_DEPARTMENT, query } from "./sql";

interface Control {
  id: string;
  title: string;
  proposedControl: string;
  /** Assumptions, not dataset values. */
  feasibility: Feasibility;
  estimatedReductionPct: number;
}

const CONTROLS: Record<InvoiceExceptionType, Control> = {
  "Missing PO": { id: "AUTO-01", title: "PO-match validation at submission", proposedControl: "Blocking PO-number validation on the supplier portal and EDI intake", feasibility: "High", estimatedReductionPct: 60 },
  "Price mismatch": { id: "AUTO-02", title: "Automated 3-way price tolerance check", proposedControl: "Automatic PO/invoice price comparison with a ±2% tolerance", feasibility: "Medium", estimatedReductionPct: 35 },
  "Duplicate suspected": { id: "AUTO-03", title: "Duplicate-invoice pre-payment screen", proposedControl: "Fuzzy duplicate check (supplier + number + amount within 30 days) before payment run", feasibility: "High", estimatedReductionPct: 70 },
  "Quantity mismatch": { id: "AUTO-04", title: "Quantity reconciliation against goods receipt", proposedControl: "Automatic line-quantity comparison to goods receipt", feasibility: "Medium", estimatedReductionPct: 40 },
  "Tax error": { id: "AUTO-05", title: "Tax recalculation on intake", proposedControl: "Recompute net + tax = gross with rounding tolerance at OCR/EDI intake", feasibility: "High", estimatedReductionPct: 80 },
  "Bank details changed": { id: "AUTO-06", title: "Bank-detail change verification workflow", proposedControl: "Mandatory call-back verification task when bank details change", feasibility: "Low", estimatedReductionPct: 25 },
  "Missing goods receipt": { id: "AUTO-07", title: "Goods-receipt reminder before invoice approval", proposedControl: "Automatic receiver reminder and hold until the goods receipt is posted", feasibility: "Medium", estimatedReductionPct: 45 },
};

/** A department owning less than this share of an exception type is not called out in the scope. */
const SCOPE_SHARE = 0.15;

/** Candidates derived from invoice_exceptions; scoring stays in lib/automation/score.ts. */
export function getAutomationOpportunities(): Promise<AutomationOpportunities> {
  return cachedAggregate("automation", computeOpportunities);
}

async function computeOpportunities(): Promise<AutomationOpportunities> {
  const [totals, byDept, names] = await Promise.all([
    query<{ exception_type: InvoiceExceptionType; frequency: number; effort_hours: number; impact_usd: number }>(sql`
      select e.exception_type, count(*) as frequency,
        coalesce(sum((julianday(e.resolved_at) - julianday(e.raised_at)) * 24), 0) as effort_hours,
        sum(i.amount_usd) as impact_usd
      from invoice_exceptions e join invoices i on i.invoice_id = e.invoice_id group by 1`),
    query<{ exception_type: InvoiceExceptionType; department_id: string; n: number }>(sql`
      select e.exception_type, cc.department_id, count(*) as n
      from invoice_exceptions e join invoices i on i.invoice_id = e.invoice_id ${JOIN_DEPARTMENT}
      group by 1, 2 order by 3 desc`),
    departmentNames(),
  ]);

  const candidates: AutomationCandidate[] = totals.map((t) => {
    const top = byDept.find((d) => d.exception_type === t.exception_type);
    const scope =
      top && top.n / t.frequency >= SCOPE_SHARE
        ? `Mostly ${names.get(top.department_id) ?? top.department_id}`
        : "All departments";
    const { id, title, proposedControl, feasibility, estimatedReductionPct } = CONTROLS[t.exception_type];
    return {
      id,
      title,
      exceptionType: t.exception_type,
      scope,
      proposedControl,
      frequency: t.frequency,
      effortHours: Math.round(t.effort_hours),
      impactUsd: Math.round(t.impact_usd),
      feasibility,
      estimatedReductionPct,
    };
  });

  return {
    meta: { source: "live", generatedAt: new Date().toISOString() },
    opportunities: scoreOpportunities(candidates),
  };
}
