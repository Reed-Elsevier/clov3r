import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { costCenters, invoices } from "../../../lib/db/schema";
import { invoiceSchema } from "../../../lib/schemas";
import { columnSpecs, ConversionError, convertCell, convertRow } from "./convert";

describe("columnSpecs", () => {
  it("derives kinds and nullability from the Drizzle table", () => {
    const specs = Object.fromEntries(columnSpecs(invoices).map((s) => [s.name, s]));
    assert.equal(specs.invoice_date.kind, "date");
    assert.equal(specs.received_at.kind, "timestamp");
    assert.equal(specs.amount_usd.kind, "decimal");
    assert.equal(specs.po_id.notNull, false);
    assert.equal(specs.invoice_id.notNull, true);
    assert.equal(columnSpecs(costCenters).length, 5);
  });
});

describe("convertCell", () => {
  const spec = (kind: Parameters<typeof convertCell>[0]["kind"], notNull = true) => ({ name: "c", kind, notNull });

  it("applies the README conversions", () => {
    assert.equal(convertCell(spec("date"), "2026-03-12 00:00:00"), "2026-03-12");
    assert.equal(convertCell(spec("timestamp"), "2026-03-16 04:34:08"), "2026-03-16 04:34:08");
    assert.equal(convertCell(spec("boolean"), "True"), true);
    assert.equal(convertCell(spec("boolean"), "False"), false);
    assert.equal(convertCell(spec("decimal"), "0.97"), 0.97);
    assert.equal(convertCell(spec("integer"), "-5"), -5);
    assert.equal(convertCell(spec("text", false), ""), null);
  });

  it("rejects bad values", () => {
    assert.throws(() => convertCell(spec("text"), ""), ConversionError);
    assert.throws(() => convertCell(spec("integer"), "1.5"), ConversionError);
    assert.throws(() => convertCell(spec("boolean"), "maybe"), ConversionError);
    assert.throws(() => convertCell(spec("date"), "12-03-2026"), ConversionError);
  });
});

describe("convertRow", () => {
  it("produces a row that satisfies the shared invoice schema", () => {
    const record = {
      invoice_id: "INV0000001",
      supplier_id: "SUP000001",
      po_id: "",
      currency: "USD",
      invoice_date: "2026-03-12 00:00:00",
      net_amount: "100",
      tax_amount: "12",
      gross_amount: "112",
      amount_usd: "112",
      invoice_number: "A-1",
      received_at: "2026-03-13 09:00:00",
      due_date: "2026-04-12 00:00:00",
      approval_level: "L1 - Team Lead",
      channel: "EDI",
      ocr_confidence: "",
      processor_employee_id: "EMP000001",
      status: "Paid",
      _ingested_at: "ignored extra column",
    };
    const row = convertRow(columnSpecs(invoices), record);
    assert.equal(row.po_id, null);
    assert.equal("_ingested_at" in row, false);
    assert.equal(invoiceSchema.safeParse(row).success, true);
  });
});
