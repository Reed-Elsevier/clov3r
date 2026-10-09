import assert from "node:assert/strict";
import { test } from "node:test";
import { mockInvoices, mockInvoiceExceptions, mockInvoiceLines, mockPayments, mockPurchaseOrders } from "../fixtures";
import { newAnomalySchema } from "../schemas";
import { runRules, validationMetrics } from "./batch";
import { engineerFeatures, type InvoiceFeatures } from "./features";
import { scoreInvoices } from "./isolation-forest-client";
import { parseFinanceCsv } from "./dataset";
import { prepareAnomalies, saveAnomalies } from "./persistence";
import { z } from "zod";

const rows = { invoices: mockInvoices, invoiceLines: mockInvoiceLines, payments: mockPayments, purchaseOrders: mockPurchaseOrders, invoiceExceptions: mockInvoiceExceptions };
const features: InvoiceFeatures[] = [{ invoice_id: "SYNTHETIC", amount_usd: 1000, vendor_avg_usd: null, processing_days: 2, ocr_confidence: null, supplier_exception_rate: 0 }];
const scoreBody = { model_version: "synthetic-test-v1", threshold: -0.5, training_row_count: 200, results: [{ invoice_id: "SYNTHETIC", score: -0.7, is_outlier: true }] };
const respond = (body: unknown): typeof fetch => async () => new Response(JSON.stringify(body), { status: 200 });

test("all rule batch rows conform to the shared schema and labels never manufacture detections", () => {
  const anomalies = runRules(rows, "2026-10-08");
  assert.ok(anomalies.length > 0);
  for (const anomaly of anomalies) assert.equal(newAnomalySchema.parse(anomaly).status, "Needs review");
  const withoutLabels = runRules({ ...rows, invoiceExceptions: [] }, "2026-10-08");
  assert.deepEqual(anomalies.map((row) => [row.invoice_id, row.category]), withoutLabels.map((row) => [row.invoice_id, row.category]));
});

test("validation counts invoice/category matches once and reports unlabeled rules honestly", () => {
  const anomaly = { invoice_id: mockInvoices[0].invoice_id, method: "rule" as const, category: "Missing PO", priority: "Low" as const, score: null, evidence: {} };
  const label = { ...mockInvoiceExceptions[0], invoice_id: anomaly.invoice_id, exception_type: "Missing PO" as const };
  const metrics = validationMetrics([anomaly, anomaly], [label, label], [anomaly.invoice_id]);
  assert.equal(metrics.find((metric) => metric.category === "Missing PO")?.precision, 1);
  assert.equal(metrics.find((metric) => metric.category === "Missing PO")?.labeled, 1);
  assert.equal(metrics.find((metric) => metric.category === "Overdue invoice")?.precision, null);
});

test("feature engineering preserves null OCR and avoids future exception information", () => {
  const invoice = { ...mockInvoices[0], invoice_id: "CURRENT", invoice_date: "2026-08-05", received_at: "2026-08-06 00:00:00", channel: "EDI" as const, ocr_confidence: 0.9 };
  const earlier = { ...invoice, invoice_id: "EARLIER", invoice_date: "2026-08-01", received_at: "2026-08-02 00:00:00" };
  const exception = { ...mockInvoiceExceptions[0], invoice_id: earlier.invoice_id, raised_at: "2026-08-07 00:00:00" };
  const result = engineerFeatures({ ...rows, invoices: [earlier, invoice], invoiceExceptions: [exception] }, "2026-10-08");
  assert.equal(result.features[1].ocr_confidence, null);
  assert.equal(result.features[1].processing_days, 1);
  assert.equal(result.features[1].supplier_exception_rate, 0);
  assert.equal(result.features[0].vendor_avg_usd, null);
  const invalid = engineerFeatures({ ...rows, invoices: [{ ...invoice, received_at: "2026-08-04 00:00:00" }] }, "2026-10-08");
  assert.equal(invalid.features.length, 0);
  assert.equal(invalid.skipped.length, 1);
});

test("scoring client stores raw scores and verified model evidence in the existing contract", async () => {
  const result = await scoreInvoices(features, { url: "http://localhost:8000", fetch: respond(scoreBody) });
  assert.equal(newAnomalySchema.parse(result[0]).method, "isolation_forest");
  assert.equal(result[0].score, -0.7);
  assert.equal(result[0].evidence.modelVersion, scoreBody.model_version);
});

test("scoring client rejects missing, duplicate, foreign and inconsistent result rows", async () => {
  for (const results of [[], [scoreBody.results[0], scoreBody.results[0]], [{ ...scoreBody.results[0], invoice_id: "FOREIGN" }], [{ ...scoreBody.results[0], is_outlier: false }]]) {
    await assert.rejects(scoreInvoices(features, { url: "http://localhost:8000", fetch: respond({ ...scoreBody, results }) }));
  }
});

test("scoring handles service errors and rejects model changes between chunks", async () => {
  await assert.rejects(scoreInvoices(features, { url: "http://localhost:8000", fetch: async () => new Response("", { status: 503 }) }), /HTTP 503/);
  let requestCount = 0;
  const changing: typeof fetch = async () => new Response(JSON.stringify({ ...scoreBody, model_version: `version-${requestCount++}`, results: [{ ...scoreBody.results[0], invoice_id: requestCount === 1 ? "SYNTHETIC" : "SECOND" }] }));
  await assert.rejects(scoreInvoices([...features, { ...features[0], invoice_id: "SECOND" }], { url: "http://localhost:8000", fetch: changing, batchSize: 1 }), /Model changed/);
});

test("CSV parser handles quoted fields, nullable numbers, and rejects blank required numbers", () => {
  const schema = z.object({ name: z.string(), amount: z.number(), confidence: z.number().nullable() });
  const records = parseFinanceCsv('name,amount,confidence\n"Vendor, Ltd",12.50,\n', schema, ["amount", "confidence"], ["confidence"]);
  assert.deepEqual(records, [{ name: "Vendor, Ltd", amount: 12.5, confidence: null }]);
  assert.throws(() => parseFinanceCsv("name,amount,confidence\nVendor,,0.9\n", schema, ["amount", "confidence"], ["confidence"]));
});

test("persistence prepares one row per detector key and cannot set human outcomes", async () => {
  const anomalies = runRules(rows, "2026-10-08");
  assert.equal(prepareAnomalies([...anomalies, ...anomalies]).length, anomalies.length);
  assert.throws(() => prepareAnomalies([{ ...anomalies[0], status: "Resolved" }]), /human review/);
  assert.equal(await saveAnomalies([]), 0);
});