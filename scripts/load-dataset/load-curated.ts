/**
 * Loads the curated `dataset/G_finance/*.csv` tables into Postgres (PLAN-02 §1).
 *
 *   npm run data:load                          # all 9 tables, FK-safe order
 *   npm run data:load -- --tables suppliers,invoices
 *   npm run data:load -- --dataset D:/reph/dataset
 *
 * Idempotent: rows are upserted on their primary key, so it can be re-run.
 * Every row is converted (README "CSV -> column conversions") and validated
 * against the shared Zod schema before insert; bad rows are skipped and reported.
 */
import "../../lib/db/load-env";

import path from "node:path";
import { getTableColumns, sql, type Table } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";

import { closeDb, getDb } from "../../lib/db/client";
import * as t from "../../lib/db/schema";
import * as s from "../../lib/schemas";
import { columnSpecs, ConversionError, convertRow } from "./lib/convert";
import { datasetDir, readCsv } from "./lib/csv";

interface TableLoad {
  name: string;
  table: PgTable;
  pk: string;
  schema: z.ZodType;
  /** Row count from dataset/_docs/validation_report.json, for the spot-check. */
  expectedRows: number;
}

// FK-safe order (scripts/load-dataset/README.md).
const TABLES: TableLoad[] = [
  { name: "cost_centers", table: t.costCenters, pk: "cost_center_id", schema: s.costCenterSchema, expectedRows: 57 },
  { name: "suppliers", table: t.suppliers, pk: "supplier_id", schema: s.supplierSchema, expectedRows: 2_400 },
  { name: "supplier_enrollment_requests", table: t.supplierEnrollmentRequests, pk: "enrollment_request_id", schema: s.supplierEnrollmentRequestSchema, expectedRows: 3_000 },
  { name: "purchase_orders", table: t.purchaseOrders, pk: "po_id", schema: s.purchaseOrderSchema, expectedRows: 40_000 },
  { name: "invoices", table: t.invoices, pk: "invoice_id", schema: s.invoiceSchema, expectedRows: 120_000 },
  { name: "invoice_lines", table: t.invoiceLines, pk: "invoice_line_id", schema: s.invoiceLineSchema, expectedRows: 406_814 },
  { name: "invoice_exceptions", table: t.invoiceExceptions, pk: "exception_id", schema: s.invoiceExceptionSchema, expectedRows: 23_400 },
  { name: "payments", table: t.payments, pk: "payment_id", schema: s.paymentSchema, expectedRows: 107_249 },
  { name: "opex_budget_vs_actual", table: t.opexBudgetVsActual, pk: "opex_row_id", schema: s.opexBudgetVsActualSchema, expectedRows: 3_249 },
];

// Keeps each INSERT well under Postgres' 65,535 bind-parameter limit (max 17 columns here).
const BATCH_SIZE = 1_000;
const MAX_ERROR_SAMPLES = 10;

function upsertSet(table: Table, pk: string) {
  return Object.fromEntries(
    Object.keys(getTableColumns(table))
      .filter((c) => c !== pk)
      .map((c) => [c, sql.raw(`excluded."${c}"`)]),
  );
}

async function loadTable(dir: string, spec: TableLoad) {
  const db = getDb();
  const specs = columnSpecs(spec.table);
  const pkColumn = getTableColumns(spec.table)[spec.pk];
  const set = upsertSet(spec.table, spec.pk);
  const file = path.join(dir, "G_finance", `${spec.name}.csv`);

  let read = 0;
  let loaded = 0;
  const errors: string[] = [];
  let batch: Record<string, unknown>[] = [];

  const flush = async () => {
    if (!batch.length) return;
    await db.insert(spec.table).values(batch).onConflictDoUpdate({ target: pkColumn, set });
    loaded += batch.length;
    batch = [];
  };

  for await (const record of readCsv(file)) {
    read++;
    try {
      const row = convertRow(specs, record);
      const parsed = spec.schema.safeParse(row);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      }
      batch.push(row);
    } catch (err) {
      if (errors.length < MAX_ERROR_SAMPLES) {
        const id = record[spec.pk] ?? `line ${read + 1}`;
        errors.push(`${id}: ${err instanceof ConversionError || err instanceof Error ? err.message : String(err)}`);
      } else if (errors.length === MAX_ERROR_SAMPLES) {
        errors.push("…more rejected rows omitted");
      }
      continue;
    }
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  return { read, loaded, rejected: read - loaded, errors };
}

async function main() {
  const dir = datasetDir();
  const only = process.argv.includes("--tables")
    ? new Set(process.argv[process.argv.indexOf("--tables") + 1]?.split(",").map((x) => x.trim()))
    : null;
  const selected = TABLES.filter((x) => !only || only.has(x.name));
  if (only && selected.length !== only.size) {
    throw new Error(`Unknown table in --tables. Valid: ${TABLES.map((x) => x.name).join(", ")}`);
  }

  console.log(`Loading ${selected.length} table(s) from ${path.join(dir, "G_finance")}`);
  const summary: Record<string, unknown>[] = [];

  for (const spec of selected) {
    const started = Date.now();
    const r = await loadTable(dir, spec);
    summary.push({
      table: spec.name,
      read: r.read,
      loaded: r.loaded,
      rejected: r.rejected,
      expected: spec.expectedRows,
      matches: r.loaded === spec.expectedRows ? "yes" : "NO",
      seconds: ((Date.now() - started) / 1000).toFixed(1),
    });
    for (const e of r.errors) console.warn(`  [${spec.name}] rejected ${e}`);
  }

  console.table(summary);
  if (summary.some((r) => r.rejected !== 0)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
