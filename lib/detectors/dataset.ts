import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import type { Table } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { columnSpecs, convertRow } from "../ingestion/convert";
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
  const read = async <Row>(name: string, table: Table, rowSchema: z.ZodType<Row>): Promise<Row[]> => {
    const records = parse(await readFile(join(directory, `${name}.csv`), "utf8"), { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    // Same conversions as the PLAN-02 loader (e.g. dataset dates "2026-03-12 00:00:00" -> "2026-03-12").
    const specs = columnSpecs(table);
    return records.map((record) => rowSchema.parse(convertRow(specs, record)));
  };
  const [invoices, invoiceLines, purchaseOrders, payments, invoiceExceptions] = await Promise.all([
    read("invoices", schema.invoices, invoiceSchema),
    read("invoice_lines", schema.invoiceLines, invoiceLineSchema),
    read("purchase_orders", schema.purchaseOrders, purchaseOrderSchema),
    read("payments", schema.payments, paymentSchema),
    read("invoice_exceptions", schema.invoiceExceptions, invoiceExceptionSchema),
  ]);
  const rows = { invoices, invoiceLines, purchaseOrders, payments, invoiceExceptions };
  if (new Set(rows.invoices.map((invoice) => invoice.invoice_id)).size !== rows.invoices.length) throw new Error("Curated input contains duplicate invoice IDs; use the ingestion cleaning path first");
  return rows;
}

export async function readFinanceDatabase(): Promise<FinanceRows> {
  const db = getDb();
  // Single read transaction gives a consistent snapshot across the five tables.
  const rows = db.transaction((transaction) => ({
    invoices: transaction.select().from(schema.invoices).all(),
    invoiceLines: transaction.select().from(schema.invoiceLines).all(),
    purchaseOrders: transaction.select().from(schema.purchaseOrders).all(),
    payments: transaction.select().from(schema.payments).all(),
    invoiceExceptions: transaction.select().from(schema.invoiceExceptions).all(),
  }));
  return {
    invoices: z.array(invoiceSchema).parse(rows.invoices),
    invoiceLines: z.array(invoiceLineSchema).parse(rows.invoiceLines),
    purchaseOrders: z.array(purchaseOrderSchema).parse(rows.purchaseOrders),
    payments: z.array(paymentSchema).parse(rows.payments),
    invoiceExceptions: z.array(invoiceExceptionSchema).parse(rows.invoiceExceptions),
  };
}