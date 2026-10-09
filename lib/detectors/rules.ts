import type { Invoice, NewAnomaly } from "../schemas";
import { DEFAULT_RULE_CONFIG, derivePriority, exceedsTolerance, type RuleConfig } from "./config";
import { calendarDay, type RelatedRows } from "./context";

export function detectMissingPo(invoice: Invoice, relatedRows?: RelatedRows, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly | null {
  if (invoice.po_id !== null) return null;
  return {
    invoice_id: invoice.invoice_id,
    method: "rule",
    category: "Missing PO",
    priority: derivePriority(invoice.amount_usd, 0, config),
    score: null,
    status: "Needs review",
    evidence: {
      summary: "Invoice has no linked purchase order; verify whether a PO is required.",
      amountUsd: invoice.amount_usd,
      approvalLevel: invoice.approval_level,
    },
  };
}

export function detectTaxTotalError(invoice: Invoice, relatedRows?: RelatedRows, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly | null {
  const expected = invoice.net_amount + invoice.tax_amount;
  const tolerance = config.roundingTolerance[invoice.currency];
  if (!exceedsTolerance(invoice.gross_amount, expected, tolerance)) return null;
  return {
    invoice_id: invoice.invoice_id,
    method: "rule",
    category: "Tax/total error",
    priority: derivePriority(invoice.amount_usd, 0, config),
    score: null,
    status: "Needs review",
    evidence: {
      summary: "Net amount plus tax does not reconcile with the recorded gross amount.",
      currency: invoice.currency,
      netAmount: invoice.net_amount,
      taxAmount: invoice.tax_amount,
      grossAmount: invoice.gross_amount,
      expectedGrossAmount: expected,
      difference: invoice.gross_amount - expected,
      tolerance,
    },
  };
}

function normalizeNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isNearNumber(first: string, second: string): boolean {
  if (Math.min(first.length, second.length) < 6 || Math.abs(first.length - second.length) > 1) return false;
  let firstIndex = 0;
  let secondIndex = 0;
  let edits = 0;
  while (firstIndex < first.length && secondIndex < second.length) {
    if (first[firstIndex] === second[secondIndex]) {
      firstIndex++;
      secondIndex++;
    } else {
      if (++edits > 1) return false;
      if (first.length >= second.length) firstIndex++;
      if (second.length >= first.length) secondIndex++;
    }
  }
  return edits + (first.length - firstIndex) + (second.length - secondIndex) <= 1;
}

export function detectDuplicateInvoice(invoice: Invoice, relatedRows: RelatedRows, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly | null {
  const number = normalizeNumber(invoice.invoice_number);
  if (!number) return null;
  const matches = relatedRows.candidates.filter((candidate) => {
    if (candidate.invoice_id === invoice.invoice_id || candidate.supplier_id !== invoice.supplier_id || candidate.currency !== invoice.currency) return false;
    if (Math.abs(calendarDay(candidate.invoice_date) - calendarDay(invoice.invoice_date)) > config.duplicateWindowDays) return false;
    if (exceedsTolerance(invoice.amount_usd, candidate.amount_usd, config.duplicateAmountToleranceUsd)) return false;
    const candidateNumber = normalizeNumber(candidate.invoice_number);
    return candidateNumber === number || isNearNumber(number, candidateNumber);
  }).sort((first, second) => {
    const firstExact = normalizeNumber(first.invoice_number) === number ? 0 : 1;
    const secondExact = normalizeNumber(second.invoice_number) === number ? 0 : 1;
    return firstExact - secondExact || first.invoice_id.localeCompare(second.invoice_id);
  });
  const matched = matches[0];
  if (!matched) return null;
  return {
    invoice_id: invoice.invoice_id,
    method: "rule",
    category: "Duplicate invoice",
    priority: invoice.amount_usd >= config.highAmountUsd ? "High" : "Medium",
    score: null,
    status: "Needs review",
    evidence: {
      summary: "Another invoice has a matching supplier, currency, amount, and similar invoice number within the configured date window.",
      matchedInvoiceId: matched.invoice_id,
      invoiceNumber: invoice.invoice_number,
      matchedInvoiceNumber: matched.invoice_number,
      amountUsd: invoice.amount_usd,
      matchedAmountUsd: matched.amount_usd,
      daysApart: Math.abs(calendarDay(invoice.invoice_date) - calendarDay(matched.invoice_date)),
      matchType: normalizeNumber(matched.invoice_number) === number ? "exact_number" : "near_number",
      dateWindowDays: config.duplicateWindowDays,
      amountToleranceUsd: config.duplicateAmountToleranceUsd,
    },
  };
}

export function detectPriceQuantityMismatch(invoice: Invoice, relatedRows: RelatedRows, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly | null {
  const order = relatedRows.purchaseOrder;
  const lines = relatedRows.lines.filter((line) => line.invoice_id === invoice.invoice_id);
  if (!order || order.po_id !== invoice.po_id || order.supplier_id !== invoice.supplier_id || order.currency !== invoice.currency || lines.length === 0) return null;
  const tolerance = config.roundingTolerance[invoice.currency];
  const total = lines.reduce((sum, line) => sum + line.line_amount, 0);
  const inconsistentLines = lines.filter((line) => exceedsTolerance(line.line_amount, line.quantity * line.unit_price, tolerance));
  const lineNetMismatch = exceedsTolerance(total, invoice.net_amount, tolerance);
  const aggregate = relatedRows.poInvoicedTotal;
  const poMismatch = relatedRows.isFinalPoInvoice && aggregate !== null && (
    (aggregate > order.po_amount || order.status === "Closed") && exceedsTolerance(aggregate, order.po_amount, tolerance)
  );
  if (!poMismatch && !lineNetMismatch && inconsistentLines.length === 0) return null;
  const comparisonTotal = poMismatch ? aggregate! : total;
  return {
    invoice_id: invoice.invoice_id,
    method: "rule",
    category: "Price/quantity mismatch",
    priority: derivePriority(invoice.amount_usd, 0, config),
    score: null,
    status: "Needs review",
    evidence: {
      summary: "Invoice line arithmetic, net total, or completed purchase-order billing requires reconciliation.",
      poId: order.po_id,
      currency: invoice.currency,
      poAmount: order.po_amount,
      invoiceLinesTotal: total,
      poInvoicedTotal: aggregate,
      netAmount: invoice.net_amount,
      lineNetDifference: total - invoice.net_amount,
      difference: comparisonTotal - order.po_amount,
      differencePct: order.po_amount !== 0 ? (comparisonTotal - order.po_amount) / Math.abs(order.po_amount) * 100 : null,
      tolerance,
      poMismatch,
      lineNetMismatch,
      inconsistentLines: inconsistentLines.map((line) => ({
        invoiceLineId: line.invoice_line_id,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        lineAmount: line.line_amount,
        expectedLineAmount: line.quantity * line.unit_price,
      })),
    },
  };
}

export function detectOverdueInvoice(invoice: Invoice, relatedRows: RelatedRows, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly | null {
  const latePayments = relatedRows.payments.filter((payment) => payment.invoice_id === invoice.invoice_id && payment.days_vs_due > 0)
    .sort((first, second) => second.days_vs_due - first.days_vs_due || first.payment_id.localeCompare(second.payment_id));
  const latePayment = latePayments[0];
  const daysOverdue = calendarDay(relatedRows.asOfDate) - calendarDay(invoice.due_date);
  if (!latePayment && (invoice.status === "Paid" || daysOverdue <= 0)) return null;
  return {
    invoice_id: invoice.invoice_id,
    method: "rule",
    category: "Overdue invoice",
    priority: derivePriority(invoice.amount_usd, latePayment?.days_vs_due ?? daysOverdue, config),
    score: null,
    status: "Needs review",
    evidence: latePayment ? {
      summary: "A recorded payment was made after the invoice due date.",
      dueDate: invoice.due_date,
      paidAt: latePayment.paid_at,
      daysVsDue: latePayment.days_vs_due,
      paymentId: latePayment.payment_id,
    } : {
      summary: "The unpaid invoice due date has passed; review payment and approval status.",
      dueDate: invoice.due_date,
      asOfDate: relatedRows.asOfDate,
      daysOverdue,
      invoiceStatus: invoice.status,
    },
  };
}

export function detectUnusualVendorTransaction(invoice: Invoice, relatedRows: RelatedRows, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly | null {
  const average = relatedRows.vendorAvgUsd;
  if (average === null || average <= 0 || relatedRows.vendorInvoiceCount < config.minimumVendorHistory || invoice.amount_usd <= average * config.vendorAmountMultiplier) return null;
  return {
    invoice_id: invoice.invoice_id,
    method: "rule",
    category: "Unusual vendor transaction",
    priority: derivePriority(invoice.amount_usd, 0, config),
    score: null,
    status: "Needs review",
    evidence: {
      summary: "Invoice amount exceeds the configured multiple of this supplier's earlier invoice average; exceptional purchases may be legitimate.",
      amountUsd: invoice.amount_usd,
      vendorAvgUsd: average,
      ratio: invoice.amount_usd / average,
      threshold: config.vendorAmountMultiplier,
      vendorInvoiceCount: relatedRows.vendorInvoiceCount,
      comparisonGroup: `supplier:${invoice.supplier_id}`,
    },
  };
}