import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { invoiceSchema, invoiceLineSchema, purchaseOrderSchema, paymentSchema, invoiceExceptionSchema } from "../schemas";
import type { FinanceRows } from "./context";

export function parseFinanceCsv<Row>(source: string, rowSchema: z.ZodType<Row>, numericColumns: string[], nullableColumns: string[]): Row[] {
  const records = parse(source, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((record) => {
    const converted: Record<string, unknown> = { ...record };
    for (const column of nullableColumns) if (record[column] === "") converted[column] = null;
    for (const column of numericColumns) {
      if (converted[column] !== null) converted[column] = record[column]?.trim() ? Number(record[column]) : NaN;
    }
    return rowSchema.parse(converted);
  });
}

export async function readFinanceCsv(directory: string): Promise<FinanceRows> {
  const read = (name: string) => readFile(join(directory, `${name}.csv`), "utf8");
  const [invoices, lines, orders, payments, exceptions] = await Promise.all([read("invoices"), read("invoice_lines"), read("purchase_orders"), read("payments"), read("invoice_exceptions")]);
  const rows = {
    invoices: parseFinanceCsv(invoices, invoiceSchema, ["net_amount", "tax_amount", "gross_amount", "amount_usd", "ocr_confidence"], ["po_id", "ocr_confidence"]),
    invoiceLines: parseFinanceCsv(lines, invoiceLineSchema, ["line_no", "quantity", "unit_price", "line_amount"], []),
    purchaseOrders: parseFinanceCsv(orders, purchaseOrderSchema, ["po_amount"], []),
    payments: parseFinanceCsv(payments, paymentSchema, ["amount", "days_vs_due"], []),
    invoiceExceptions: parseFinanceCsv(exceptions, invoiceExceptionSchema, [], ["resolved_at", "resolution"]),
  };
  if (new Set(rows.invoices.map((invoice) => invoice.invoice_id)).size !== rows.invoices.length) throw new Error("Curated input contains duplicate invoice IDs; use the ingestion cleaning path first");
  return rows;
}

export async function readFinanceDatabase(): Promise<FinanceRows> {
  const db = getDb();
  return db.transaction(async (transaction) => {
    const [invoices, invoiceLines, purchaseOrders, payments, invoiceExceptions] = await Promise.all([
      transaction.select().from(schema.invoices), transaction.select().from(schema.invoiceLines), transaction.select().from(schema.purchaseOrders), transaction.select().from(schema.payments), transaction.select().from(schema.invoiceExceptions),
    ]);
    return {
      invoices: z.array(invoiceSchema).parse(invoices),
      invoiceLines: z.array(invoiceLineSchema).parse(invoiceLines),
      purchaseOrders: z.array(purchaseOrderSchema).parse(purchaseOrders),
      payments: z.array(paymentSchema).parse(payments),
      invoiceExceptions: z.array(invoiceExceptionSchema).parse(invoiceExceptions),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}