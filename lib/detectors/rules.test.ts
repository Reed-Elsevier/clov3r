import assert from "node:assert/strict";
import { test } from "node:test";
import { mockInvoices, mockInvoiceLines, mockPurchaseOrders, mockPayments } from "../fixtures";
import { newAnomalySchema } from "../schemas";
import { DEFAULT_RULE_CONFIG } from "./config";
import { buildContexts, calendarDay, timestampMilliseconds, type RelatedRows } from "./context";
import { detectDuplicateInvoice, detectMissingPo, detectOverdueInvoice, detectPriceQuantityMismatch, detectTaxTotalError, detectUnusualVendorTransaction } from "./rules";

const invoice = mockInvoices[0];
const related: RelatedRows = {
  asOfDate: invoice.due_date,
  candidates: [],
  lines: [],
  payments: [],
  vendorAvgUsd: 100,
  vendorInvoiceCount: 3,
  poInvoicedTotal: null,
  isFinalPoInvoice: true,
};

test("missing PO produces a contract-compatible human-review recommendation", () => {
  const result = detectMissingPo({ ...invoice, po_id: null });
  assert.ok(result);
  assert.equal(newAnomalySchema.parse(result).status, "Needs review");
  assert.equal(result.score, null);
  assert.equal(result.evidence.amountUsd, invoice.amount_usd);
  assert.equal(detectMissingPo(invoice), null);
});

test("tax tolerance is inclusive and robust to floating-point rounding", () => {
  assert.equal(detectTaxTotalError({ ...invoice, net_amount: 0.1, tax_amount: 0.2, gross_amount: 0.31 }), null);
  const result = detectTaxTotalError({ ...invoice, gross_amount: invoice.gross_amount + 0.02 });
  assert.ok(result);
  assert.equal(newAnomalySchema.parse(result).category, "Tax/total error");
  assert.equal(result.evidence.expectedGrossAmount, invoice.net_amount + invoice.tax_amount);
});

test("JPY totals use a one-yen rounding tolerance", () => {
  assert.equal(detectTaxTotalError({ ...invoice, currency: "JPY", gross_amount: invoice.gross_amount + 1 }), null);
  assert.ok(detectTaxTotalError({ ...invoice, currency: "JPY", gross_amount: invoice.gross_amount + 2 }));
});

test("duplicates normalize punctuation, require same supplier and currency, and include the date boundary", () => {
  const candidate = { ...invoice, invoice_id: "MATCH", invoice_number: " mcp 2608 001 ", invoice_date: "2026-08-10" };
  const result = detectDuplicateInvoice(invoice, { ...related, candidates: [candidate, invoice] });
  assert.ok(result);
  assert.equal(newAnomalySchema.parse(result).evidence.daysApart, 7);
  assert.equal(result.evidence.matchType, "exact_number");
  for (const changed of [{ supplier_id: "OTHER" }, { currency: "EUR" as const }, { invoice_date: "2026-08-11" }, { amount_usd: 99 }]) {
    assert.equal(detectDuplicateInvoice(invoice, { ...related, candidates: [{ ...candidate, ...changed }] }), null);
  }
});

test("near-number matching accepts one edit but not unrelated same-amount invoices", () => {
  const candidate = { ...invoice, invoice_id: "MATCH", invoice_number: "MCP-2608-002" };
  assert.equal(detectDuplicateInvoice(invoice, { ...related, candidates: [candidate] })?.evidence.matchType, "near_number");
  assert.equal(detectDuplicateInvoice(invoice, { ...related, candidates: [{ ...candidate, invoice_number: "OTHER-009" }] }), null);
  assert.equal(detectDuplicateInvoice({ ...invoice, invoice_number: "" }, { ...related, candidates: [candidate] }), null);
});

test("overdue uses UTC calendar dates: due today and paid on time are not flagged", () => {
  const unpaid = { ...invoice, status: "Approved" as const };
  assert.equal(detectOverdueInvoice(unpaid, related), null);
  const result = detectOverdueInvoice(unpaid, { ...related, asOfDate: "2026-09-03" });
  assert.equal(result?.evidence.daysOverdue, 1);
  assert.equal(detectOverdueInvoice(invoice, { ...related, asOfDate: "2026-10-08" }), null);
  assert.throws(() => calendarDay("2026-02-30"), /Invalid calendar date/);
});

test("late payment evidence is numeric and tied to the matching invoice", () => {
  const payment = { ...mockPayments[0], invoice_id: invoice.invoice_id, days_vs_due: 31 };
  const result = detectOverdueInvoice(invoice, { ...related, payments: [payment] });
  assert.equal(result?.evidence.daysVsDue, 31);
  assert.equal(result?.priority, "High");
  assert.equal(detectOverdueInvoice(invoice, { ...related, payments: [{ ...payment, invoice_id: "OTHER" }] }), null);
});

test("PO reconciliation permits partial billing but catches line errors and completed-PO differences", () => {
  const line = { ...mockInvoiceLines[0], invoice_id: invoice.invoice_id, quantity: 1, unit_price: invoice.net_amount, line_amount: invoice.net_amount };
  const order = { ...mockPurchaseOrders[0], po_id: invoice.po_id!, supplier_id: invoice.supplier_id, currency: invoice.currency };
  const context = { ...related, lines: [line], purchaseOrder: order, poInvoicedTotal: invoice.net_amount };
  assert.equal(detectPriceQuantityMismatch(invoice, context), null);
  assert.ok(detectPriceQuantityMismatch(invoice, { ...context, lines: [{ ...line, quantity: 2 }] }));
  assert.ok(detectPriceQuantityMismatch(invoice, { ...context, purchaseOrder: { ...order, status: "Closed" } }));
  assert.equal(detectPriceQuantityMismatch(invoice, { ...context, purchaseOrder: { ...order, status: "Closed" }, isFinalPoInvoice: false }), null);
  assert.equal(detectPriceQuantityMismatch(invoice, { ...context, purchaseOrder: { ...order, currency: "EUR" } }), null);
});

test("vendor threshold is strict, configurable, and requires historical support", () => {
  assert.equal(detectUnusualVendorTransaction({ ...invoice, amount_usd: 300 }, related), null);
  const result = detectUnusualVendorTransaction({ ...invoice, amount_usd: 301 }, related);
  assert.equal(result?.evidence.ratio, 3.01);
  assert.equal(detectUnusualVendorTransaction(invoice, { ...related, vendorInvoiceCount: 2 }), null);
  assert.equal(detectUnusualVendorTransaction(invoice, { ...related, vendorAvgUsd: 0 }), null);
  assert.equal(detectUnusualVendorTransaction(invoice, related, { ...DEFAULT_RULE_CONFIG, vendorAmountMultiplier: 100 }), null);
});

test("batch vendor baselines exclude self, same-day invoices, and future records", () => {
  const first = { ...invoice, invoice_id: "FIRST", invoice_date: "2026-08-01", amount_usd: 100 };
  const current = { ...invoice, invoice_id: "CURRENT", invoice_date: "2026-08-02", amount_usd: 900 };
  const sameDay = { ...current, invoice_id: "SAME", amount_usd: 10_000 };
  const future = { ...current, invoice_id: "FUTURE", invoice_date: "2026-08-03", amount_usd: 20_000 };
  const contexts = buildContexts({ invoices: [future, sameDay, current, first], invoiceLines: [], payments: [], purchaseOrders: [], invoiceExceptions: [] }, "2026-10-08", 7);
  assert.equal(contexts.get("CURRENT")?.vendorAvgUsd, 100);
  assert.equal(contexts.get("CURRENT")?.vendorInvoiceCount, 1);
  assert.equal(contexts.get("FIRST")?.vendorAvgUsd, null);
});

test("dataset timestamps use UTC and accept PostgreSQL short offsets", () => {
  assert.equal(timestampMilliseconds("2026-08-01 09:00:00"), timestampMilliseconds("2026-08-01T09:00:00+00"));
  assert.equal(timestampMilliseconds("2026-08-01T10:00:00+01"), timestampMilliseconds("2026-08-01T09:00:00Z"));
  assert.throws(() => timestampMilliseconds("2026-02-30 09:00:00"), /Invalid calendar date/);
});