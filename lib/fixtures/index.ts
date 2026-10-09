/**
 * Small, hand-built mock fixtures matching the data contract, for building
 * dashboard pages, detectors and explanation prompts before real data and
 * routes land. All rows are internally consistent (FKs resolve, invoice lines
 * sum to `net_amount`, amounts in USD so `amount_usd = gross_amount`).
 *
 * IDs use a `9…` range (e.g. `INV9000001`) so they never collide with real
 * dataset IDs. Every value here is made up — never present it as a finding.
 */
import type {
  Anomaly,
  AnomalyDetail,
  AnomalyExplanation,
  AnomalyListItem,
  CostCenter,
  Invoice,
  InvoiceException,
  InvoiceLine,
  OpexBudgetVsActual,
  Payment,
  PurchaseOrder,
  Supplier,
  SupplierEnrollmentRequest,
} from "../schemas";

export const mockCostCenters: CostCenter[] = [
  {
    cost_center_id: "CC9001",
    department_id: "DEP001",
    division_id: "DIV01",
    cost_center_name: "Journal Operations Ops (mock)",
    site_id: "SITE01",
  },
  {
    cost_center_id: "CC9002",
    department_id: "DEP010",
    division_id: "DIV02",
    cost_center_name: "IT Platform Ops (mock)",
    site_id: "SITE02",
  },
];

export const mockSuppliers: Supplier[] = [
  {
    supplier_id: "SUP900001",
    entity_id: "ENT900001",
    supplier_name: "Mock Content Partners Ltd.",
    category: "Content Vendors",
    country: "United Kingdom",
    payment_terms_days: 30,
    risk_tier: "Low",
    preferred: true,
    onboarded_date: "2023-04-12",
    status: "Active",
  },
  {
    supplier_id: "SUP900002",
    entity_id: "ENT900002",
    supplier_name: "Mock Cloud Software Inc.",
    category: "Software",
    country: "United States",
    payment_terms_days: 45,
    risk_tier: "Medium",
    preferred: false,
    onboarded_date: "2024-01-20",
    status: "Active",
  },
  {
    supplier_id: "SUP900003",
    entity_id: "ENT900003",
    supplier_name: "Mock Facilities Services Pte. Ltd.",
    category: "Facilities",
    country: "Singapore",
    payment_terms_days: 15,
    risk_tier: "High",
    preferred: false,
    onboarded_date: "2026-06-02",
    status: "Active",
  },
];

export const mockSupplierEnrollmentRequests: SupplierEnrollmentRequest[] = [
  {
    enrollment_request_id: "SER900001",
    supplier_id: "SUP900003",
    requested_by_employee_id: "EMP900005",
    submitted_at: "2026-05-20 09:00:00",
    documents_complete_first_pass: false,
    tax_document_ok: true,
    bank_details_ok: false,
    sanctions_screen_ok: true,
    turnaround_days: 12.5,
    decided_at: "2026-06-01 21:00:00",
    status: "Approved after remediation",
  },
];

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    po_id: "PO9000001",
    supplier_id: "SUP900001",
    cost_center_id: "CC9001",
    requester_employee_id: "EMP900001",
    approver_employee_id: "EMP900002",
    po_date: "2026-07-01",
    currency: "USD",
    po_amount: 20000,
    status: "Partially invoiced",
  },
  {
    po_id: "PO9000002",
    supplier_id: "SUP900002",
    cost_center_id: "CC9002",
    requester_employee_id: "EMP900003",
    approver_employee_id: "EMP900004",
    po_date: "2026-06-15",
    currency: "USD",
    po_amount: 150000,
    status: "Open",
  },
  {
    po_id: "PO9000003",
    supplier_id: "SUP900003",
    cost_center_id: "CC9001",
    requester_employee_id: "EMP900001",
    approver_employee_id: "EMP900002",
    po_date: "2026-08-01",
    currency: "USD",
    po_amount: 12000,
    status: "Open",
  },
];

export const mockInvoices: Invoice[] = [
  // Clean, paid original.
  {
    invoice_id: "INV9000001",
    supplier_id: "SUP900001",
    po_id: "PO9000001",
    currency: "USD",
    invoice_date: "2026-08-03",
    net_amount: 8000,
    tax_amount: 400,
    gross_amount: 8400,
    amount_usd: 8400,
    invoice_number: "MCP-2608-001",
    received_at: "2026-08-04 09:12:00",
    due_date: "2026-09-02",
    approval_level: "L1 - Team Lead",
    channel: "Email",
    ocr_confidence: 0.97,
    processor_employee_id: "EMP900010",
    status: "Paid",
  },
  // Duplicate of INV9000001 (same supplier, number and amount).
  {
    invoice_id: "INV9000002",
    supplier_id: "SUP900001",
    po_id: "PO9000001",
    currency: "USD",
    invoice_date: "2026-08-05",
    net_amount: 8000,
    tax_amount: 400,
    gross_amount: 8400,
    amount_usd: 8400,
    invoice_number: "MCP-2608-001",
    received_at: "2026-08-06 10:01:00",
    due_date: "2026-09-04",
    approval_level: "L1 - Team Lead",
    channel: "Supplier portal",
    ocr_confidence: null,
    processor_employee_id: "EMP900011",
    status: "On hold - exception",
  },
  // No PO.
  {
    invoice_id: "INV9000003",
    supplier_id: "SUP900003",
    po_id: null,
    currency: "USD",
    invoice_date: "2026-08-20",
    net_amount: 4500,
    tax_amount: 315,
    gross_amount: 4815,
    amount_usd: 4815,
    invoice_number: "MFS-0820-17",
    received_at: "2026-08-21 08:00:00",
    due_date: "2026-09-04",
    approval_level: "L1 - Team Lead",
    channel: "Email",
    ocr_confidence: 0.81,
    processor_employee_id: "EMP900010",
    status: "On hold - exception",
  },
  // Gross does not reconcile: 30,000 + 2,400 != 33,400.
  {
    invoice_id: "INV9000004",
    supplier_id: "SUP900002",
    po_id: "PO9000002",
    currency: "USD",
    invoice_date: "2026-07-10",
    net_amount: 30000,
    tax_amount: 2400,
    gross_amount: 33400,
    amount_usd: 33400,
    invoice_number: "MCS-INV-55120",
    received_at: "2026-07-11 14:30:00",
    due_date: "2026-08-24",
    approval_level: "L2 - Manager",
    channel: "EDI",
    ocr_confidence: null,
    processor_employee_id: "EMP900012",
    status: "Paid",
  },
  // Unusually high amount for this supplier.
  {
    invoice_id: "INV9000005",
    supplier_id: "SUP900002",
    po_id: "PO9000002",
    currency: "USD",
    invoice_date: "2026-08-25",
    net_amount: 112000,
    tax_amount: 8960,
    gross_amount: 120960,
    amount_usd: 120960,
    invoice_number: "MCS-INV-55891",
    received_at: "2026-08-26 11:45:00",
    due_date: "2026-10-09",
    approval_level: "L3 - Director",
    channel: "EDI",
    ocr_confidence: null,
    processor_employee_id: "EMP900012",
    status: "Approved",
  },
  // Approved but unpaid past its due date.
  {
    invoice_id: "INV9000006",
    supplier_id: "SUP900003",
    po_id: "PO9000003",
    currency: "USD",
    invoice_date: "2026-08-10",
    net_amount: 9000,
    tax_amount: 630,
    gross_amount: 9630,
    amount_usd: 9630,
    invoice_number: "MFS-0810-09",
    received_at: "2026-08-12 16:20:00",
    due_date: "2026-08-25",
    approval_level: "L1 - Team Lead",
    channel: "Email",
    ocr_confidence: 0.74,
    processor_employee_id: "EMP900011",
    status: "Approved",
  },
];

export const mockInvoiceLines: InvoiceLine[] = [
  {
    invoice_line_id: "IL90000001",
    invoice_id: "INV9000001",
    line_no: 1,
    description: "Copyediting & typesetting",
    quantity: 40,
    unit_price: 200,
    line_amount: 8000,
    gl_account: "6400 Content services",
    cost_center_id: "CC9001",
  },
  {
    invoice_line_id: "IL90000002",
    invoice_id: "INV9000002",
    line_no: 1,
    description: "Copyediting & typesetting",
    quantity: 40,
    unit_price: 200,
    line_amount: 8000,
    gl_account: "6400 Content services",
    cost_center_id: "CC9001",
  },
  {
    invoice_line_id: "IL90000003",
    invoice_id: "INV9000003",
    line_no: 1,
    description: "Facility maintenance",
    quantity: 3,
    unit_price: 1500,
    line_amount: 4500,
    gl_account: "6300 Facilities",
    cost_center_id: "CC9001",
  },
  {
    invoice_line_id: "IL90000004",
    invoice_id: "INV9000004",
    line_no: 1,
    description: "Licence renewal",
    quantity: 10,
    unit_price: 3000,
    line_amount: 30000,
    gl_account: "6100 Software",
    cost_center_id: "CC9002",
  },
  {
    invoice_line_id: "IL90000005",
    invoice_id: "INV9000005",
    line_no: 1,
    description: "Licence renewal",
    quantity: 32,
    unit_price: 3500,
    line_amount: 112000,
    gl_account: "6100 Software",
    cost_center_id: "CC9002",
  },
  {
    invoice_line_id: "IL90000006",
    invoice_id: "INV9000006",
    line_no: 1,
    description: "Facility maintenance",
    quantity: 6,
    unit_price: 1500,
    line_amount: 9000,
    gl_account: "6300 Facilities",
    cost_center_id: "CC9001",
  },
];

export const mockInvoiceExceptions: InvoiceException[] = [
  {
    exception_id: "IEX9000001",
    invoice_id: "INV9000002",
    exception_type: "Duplicate suspected",
    raised_at: "2026-08-06 15:00:00",
    resolved_at: null,
    resolver_employee_id: "EMP900020",
    resolution: null,
  },
  {
    exception_id: "IEX9000002",
    invoice_id: "INV9000003",
    exception_type: "Missing PO",
    raised_at: "2026-08-21 12:00:00",
    resolved_at: null,
    resolver_employee_id: "EMP900021",
    resolution: null,
  },
];

export const mockPayments: Payment[] = [
  {
    payment_id: "PAY9000001",
    invoice_id: "INV9000001",
    paid_at: "2026-08-28 10:00:00",
    amount: 8400,
    currency: "USD",
    method: "Bank transfer",
    payment_run_id: "RUN-202635",
    days_vs_due: -5,
  },
  {
    payment_id: "PAY9000002",
    invoice_id: "INV9000004",
    paid_at: "2026-08-27 10:00:00",
    amount: 33400,
    currency: "USD",
    method: "Wire",
    payment_run_id: "RUN-202635",
    days_vs_due: 3,
  },
];

export const mockOpexBudgetVsActual: OpexBudgetVsActual[] = [
  {
    opex_row_id: "OPX900001",
    cost_center_id: "CC9001",
    division_id: "DIV01",
    month: "2026-08-01",
    budget_php: 3766000,
    actual_php: 4333000,
    variance_php: 567000,
    variance_pct: 15.06,
  },
  {
    opex_row_id: "OPX900002",
    cost_center_id: "CC9002",
    division_id: "DIV02",
    month: "2026-08-01",
    budget_php: 5200000,
    actual_php: 4980000,
    variance_php: -220000,
    variance_pct: -4.23,
  },
];

export const mockAnomalies: Anomaly[] = [
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e01",
    invoice_id: "INV9000002",
    method: "rule",
    category: "Duplicate invoice",
    priority: "High",
    score: null,
    evidence: {
      summary: "Same supplier, invoice number and amount as INV9000001, 2 days apart",
      matchedInvoiceId: "INV9000001",
      invoiceNumber: "MCP-2608-001",
      matchedInvoiceNumber: "MCP-2608-001",
      amountUsd: 8400,
      matchedAmountUsd: 8400,
      daysApart: 2,
      matchType: "exact_number",
      groundTruthExceptionIds: ["IEX9000001"],
    },
    status: "Needs review",
    created_at: "2026-09-30 02:00:00+00",
  },
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e02",
    invoice_id: "INV9000003",
    method: "rule",
    category: "Missing PO",
    priority: "Medium",
    score: null,
    evidence: {
      summary: "No purchase order linked to this invoice",
      amountUsd: 4815,
      approvalLevel: "L1 - Team Lead",
      groundTruthExceptionIds: ["IEX9000002"],
    },
    status: "Investigating",
    created_at: "2026-09-30 02:00:00+00",
  },
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e03",
    invoice_id: "INV9000004",
    method: "rule",
    category: "Tax/total error",
    priority: "Medium",
    score: null,
    evidence: {
      summary: "Gross 33,400.00 does not equal net 30,000.00 + tax 2,400.00 (difference 1,000.00)",
      currency: "USD",
      netAmount: 30000,
      taxAmount: 2400,
      grossAmount: 33400,
      expectedGrossAmount: 32400,
      difference: 1000,
      tolerance: 0.01,
      invoiceLinesTotal: 30000,
    },
    status: "Needs review",
    created_at: "2026-09-30 02:00:00+00",
  },
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e04",
    invoice_id: "INV9000005",
    method: "statistical",
    category: "Unusually high amount",
    priority: "High",
    score: 4.2,
    evidence: {
      summary: "USD 120,960 is 4.2 standard deviations above this supplier's mean",
      amountUsd: 120960,
      comparisonGroup: "supplier:SUP900002",
      groupMeanUsd: 28560,
      groupStdUsd: 22000,
      zScore: 4.2,
      threshold: 3,
    },
    status: "Needs review",
    created_at: "2026-09-30 02:00:00+00",
  },
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e05",
    invoice_id: "INV9000005",
    method: "isolation_forest",
    category: "Multivariate outlier",
    priority: "Medium",
    score: -0.087,
    evidence: {
      summary: "Unusual combination of amount, vendor history and processing time",
      threshold: 0,
      modelVersion: "iforest-mock",
      features: {
        amountUsd: 120960,
        vendorAvgUsd: 28560,
        processingDays: 1,
        ocrConfidence: null,
        supplierExceptionRate: 0.05,
      },
    },
    status: "Needs review",
    created_at: "2026-09-30 02:10:00+00",
  },
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e06",
    invoice_id: "INV9000006",
    method: "rule",
    category: "Overdue invoice",
    priority: "High",
    score: null,
    evidence: {
      summary: "Unpaid 36 days past its due date",
      dueDate: "2026-08-25",
      asOfDate: "2026-09-30",
      daysOverdue: 36,
      invoiceStatus: "Approved",
    },
    status: "Resolved",
    created_at: "2026-09-30 02:00:00+00",
  },
];

export const mockAnomalyExplanations: AnomalyExplanation[] = [
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e01",
    explanation:
      "Invoice INV9000002 has the same supplier, invoice number (MCP-2608-001) and amount (USD 8,400) as INV9000001, and was received 2 days later.",
    evidence_summary:
      "Invoice number MCP-2608-001 on both; amount USD 8,400 on both; 2 days apart.",
    potential_impact:
      "If both invoices are paid, the supplier would receive a duplicate payment of USD 8,400.",
    recommended_actions: [
      "Confirm with the supplier whether INV9000002 is a resubmission of INV9000001.",
      "Keep INV9000002 on hold until the supplier confirms.",
      "If it is a duplicate, request cancellation or a credit note.",
    ],
    preventive_measure:
      "Reject invoice numbers already received from the same supplier at intake.",
    requires_human_review: true,
    model_id: "mock-model (fixture)",
    generated_at: "2026-09-30 02:05:00+00",
  },
  {
    anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e04",
    explanation:
      "Invoice INV9000005 totals USD 120,960, which is 4.2 standard deviations above this supplier's mean invoice amount of USD 28,560 (flagging threshold: 3).",
    evidence_summary:
      "Amount USD 120,960; supplier mean USD 28,560; standard deviation USD 22,000; z-score 4.2.",
    potential_impact:
      "If the amount is wrong, USD 120,960 could be paid without the discrepancy being caught.",
    recommended_actions: [
      "Confirm the quantity and unit price with the requester before payment.",
      "Compare the amount with the remaining balance on the linked purchase order.",
      "Verify the invoice with the supplier contact on file.",
    ],
    preventive_measure:
      "Send invoices that are far above a supplier's usual amounts to an extra approval step.",
    requires_human_review: true,
    model_id: "mock-model (fixture)",
    generated_at: "2026-09-30 02:15:00+00",
  },
];

function requireRow<T>(rows: T[], predicate: (row: T) => boolean, what: string): T {
  const row = rows.find(predicate);
  if (!row) throw new Error(`Fixture integrity error: missing ${what}`);
  return row;
}

/** Mock `GET /api/anomalies` rows (anomalies joined with invoice + supplier). */
export const mockAnomalyListItems: AnomalyListItem[] = mockAnomalies.map((anomaly) => {
  const invoice = requireRow(mockInvoices, (i) => i.invoice_id === anomaly.invoice_id, anomaly.invoice_id);
  const supplier = requireRow(mockSuppliers, (s) => s.supplier_id === invoice.supplier_id, invoice.supplier_id);
  return {
    ...anomaly,
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    amount_usd: invoice.amount_usd,
    supplier_id: supplier.supplier_id,
    supplier_name: supplier.supplier_name,
    has_explanation: mockAnomalyExplanations.some((e) => e.anomaly_id === anomaly.anomaly_id),
  };
});

/** Mock `GET /api/anomalies/[id]` payloads, keyed by `anomaly_id`. */
export const mockAnomalyDetails: Record<string, AnomalyDetail> = Object.fromEntries(
  mockAnomalies.map((anomaly) => {
    const invoice = requireRow(mockInvoices, (i) => i.invoice_id === anomaly.invoice_id, anomaly.invoice_id);
    const supplier = requireRow(mockSuppliers, (s) => s.supplier_id === invoice.supplier_id, invoice.supplier_id);
    const explanation =
      mockAnomalyExplanations.find((e) => e.anomaly_id === anomaly.anomaly_id) ?? null;
    return [anomaly.anomaly_id, { anomaly, invoice, supplier, explanation }];
  }),
);
