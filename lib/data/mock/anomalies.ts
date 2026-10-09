import type {
  AnomalyDetail,
  AnomalyExplanation,
  AnomalyMethod,
  AnomalyPriority,
  AnomalyStatus,
  Evidence,
} from "@/lib/types/dashboard";

// Illustrative rows shaped like PLAN-01 `anomalies` + `anomaly_explanations`; deterministic so SSR and client agree.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const SUPPLIERS = [
  { id: "SUP-0012", name: "Northwind Office Supply" },
  { id: "SUP-0047", name: "Apex Logistics" },
  { id: "SUP-0103", name: "Bluepeak IT Services" },
  { id: "SUP-0158", name: "Metro Facilities Co." },
  { id: "SUP-0211", name: "Crescent Media Group" },
  { id: "SUP-0264", name: "Harbor Industrial Parts" },
  { id: "SUP-0319", name: "Summit Consulting" },
  { id: "SUP-0377", name: "Greenline Catering" },
];

type Builder = (r: () => number, amount: number, invoiceDate: string) => { evidence: Evidence; summary: string };

const CATEGORIES: { category: string; method: AnomalyMethod; build: Builder }[] = [
  {
    category: "Duplicate suspected",
    method: "rule",
    build: (r) => {
      const days = 1 + Math.floor(r() * 6);
      const match = `INV-${String(100000 + Math.floor(r() * 899999))}`;
      return {
        evidence: { matched_invoice_id: match, days_apart: days, amount_difference_usd: 0, same_invoice_number: true },
        summary: `Same supplier, number and amount as ${match} (${days}d apart)`,
      };
    },
  },
  {
    category: "Missing PO",
    method: "rule",
    build: (r, amount) => ({
      evidence: { po_id: null, approval_level: amount > 25000 ? "L3" : amount > 5000 ? "L2" : "L1", amount_usd: amount },
      summary: "Invoice has no linked purchase order",
    }),
  },
  {
    category: "Price mismatch",
    method: "rule",
    build: (r, amount) => {
      const variance = 6 + Math.round(r() * 30);
      const po = Math.round(amount / (1 + variance / 100));
      return {
        evidence: { po_id: `PO-${40000 + Math.floor(r() * 9999)}`, po_amount_usd: po, invoice_amount_usd: amount, variance_pct: variance },
        summary: `Invoice exceeds PO amount by ${variance}%`,
      };
    },
  },
  {
    category: "Tax error",
    method: "rule",
    build: (r, amount) => {
      const net = Math.round(amount / 1.12);
      const tax = Math.round(net * (0.12 + (r() - 0.5) * 0.06));
      const expected = net + Math.round(net * 0.12);
      return {
        evidence: { net_amount: net, tax_amount: tax, gross_amount: amount, expected_gross: expected, difference: amount - expected },
        summary: `Net + tax doesn't reconcile to gross (Δ ${amount - expected})`,
      };
    },
  },
  {
    category: "Overdue invoice",
    method: "rule",
    build: (r) => {
      const days = 3 + Math.floor(r() * 40);
      return {
        evidence: { status: "On hold - exception", days_overdue: days },
        summary: `Unpaid ${days} days past due date`,
      };
    },
  },
  {
    category: "Unusual vendor amount",
    method: "statistical",
    build: (r, amount) => {
      const avg = Math.round(amount / (3 + r() * 7));
      const z = Math.round((3 + r() * 4) * 10) / 10;
      return {
        evidence: { amount_usd: amount, supplier_avg_usd: avg, z_score: z, comparison_group: "same supplier, trailing 12 months" },
        summary: `${(amount / avg).toFixed(1)}× supplier average (z = ${z})`,
      };
    },
  },
  {
    category: "Multivariate outlier",
    method: "isolation_forest",
    build: (r) => {
      const s = Math.round((0.62 + r() * 0.3) * 100) / 100;
      return {
        evidence: { isolation_score: s, top_feature_1: "processing_days", top_feature_2: "amount_usd", top_feature_3: "ocr_confidence" },
        summary: `Unusual combination of processing time, amount and OCR confidence`,
      };
    },
  },
];

function priorityFor(amount: number, score: number): AnomalyPriority {
  if (amount > 25000 || score > 0.85) return "High";
  if (amount > 5000 || score > 0.6) return "Medium";
  return "Low";
}

function buildExplanation(a: Omit<AnomalyDetail, "explanation">): AnomalyExplanation {
  return {
    explanation: `${a.invoiceId} was flagged as "${a.category}" by ${a.method === "rule" ? "a business rule" : a.method === "statistical" ? "statistical outlier detection" : "the Isolation Forest model"}. ${a.evidenceSummary}.`,
    potentialImpact: `The invoice (${a.amountUsd.toLocaleString("en-US", { style: "currency", currency: "USD" })}) may require additional verification before approval or payment. This is not evidence of fraud.`,
    recommendedActions: [
      "Compare the invoice against the purchase order and goods receipt.",
      `Confirm the details with ${a.supplierName} records.`,
      "Record the review outcome and update the status.",
    ],
    preventiveMeasure: `Add an automated check for "${a.category}" at invoice submission.`,
    modelId: "mock-explainer",
    generatedAt: a.createdAt,
  };
}

const STATUSES: AnomalyStatus[] = ["Needs review", "Needs review", "Needs review", "Investigating", "Resolved", "Dismissed"];

export function buildMockAnomalies(count = 48): AnomalyDetail[] {
  const r = rng(42);
  return Array.from({ length: count }, (_, i) => {
    const cat = CATEGORIES[Math.floor(r() * CATEGORIES.length)];
    const sup = SUPPLIERS[Math.floor(r() * SUPPLIERS.length)];
    const amount = Math.round(300 + r() ** 2.2 * 85000);
    const month = 1 + Math.floor(r() * 9);
    const day = 1 + Math.floor(r() * 27);
    const invoiceDate = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const score = Math.round((0.4 + r() * 0.6) * 100) / 100;
    const { evidence, summary } = cat.build(r, amount, invoiceDate);
    const base = {
      anomalyId: `ANM-${String(i + 1).padStart(5, "0")}`,
      invoiceId: `INV-${String(200000 + Math.floor(r() * 799999))}`,
      supplierId: sup.id,
      supplierName: sup.name,
      category: cat.category,
      method: cat.method,
      priority: priorityFor(amount, score),
      score,
      evidenceSummary: summary,
      status: STATUSES[Math.floor(r() * STATUSES.length)],
      amountUsd: amount,
      invoiceDate,
      createdAt: `${invoiceDate}T09:00:00.000Z`,
      evidence,
    };
    return { ...base, explanation: i % 3 === 0 ? buildExplanation(base) : null };
  }).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
}

export const mockExplain = buildExplanation;
