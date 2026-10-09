/**
 * Cleans the dirty `dataset/raw/{suppliers,invoices}_raw.csv` files and writes
 * a data-quality report (PLAN-02 §2 — demo evidence for IDEA.md Stage 1).
 *
 *   npm run data:clean-raw                 # report only (no DB needed)
 *   npm run data:clean-raw -- --write      # also upsert clean rows into SQLite
 *
 * Rules: normalise mixed date formats, trim/collapse whitespace, fix casing and
 * near-miss typos in categorical columns, drop near-duplicate rows (same PK,
 * keep earliest `_ingested_at`), and FLAG — never silently drop or guess —
 * orphaned `supplier_id`s, blank required fields and anything else that still
 * fails the shared Zod schema. Flagged rows are never written to the database.
 */
import "../../lib/db/load-env";

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getTableColumns, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { z } from "zod";

import { closeDb, getDb } from "../../lib/db/client";
import * as t from "../../lib/db/schema";
import * as s from "../../lib/schemas";
import { columnSpecs, convertRow, type ColumnSpec } from "./lib/convert";
import { datasetDir, domainDir, hasFlag, readAllCsv } from "./lib/csv";
import { cleanText, dedupeByKey, matchEnum, normalizeDate, normalizeTimestamp, parseNumber } from "./lib/normalize";

interface RawTable {
  name: "suppliers" | "invoices";
  file: string;
  table: SQLiteTable;
  pk: string;
  schema: z.ZodType;
}

const RAW_TABLES: RawTable[] = [
  { name: "suppliers", file: "raw/suppliers_raw.csv", table: t.suppliers, pk: "supplier_id", schema: s.supplierSchema },
  { name: "invoices", file: "raw/invoices_raw.csv", table: t.invoices, pk: "invoice_id", schema: s.invoiceSchema },
];

const BOOLEAN_WORDS: Record<string, string> = { true: "true", t: "true", yes: "true", y: "true", "1": "true", false: "false", f: "false", no: "false", n: "false", "0": "false" };
const MAX_SAMPLES = 25;

type Counter = Record<string, number>;
const bump = (c: Counter, key: string) => (c[key] = (c[key] ?? 0) + 1);

interface CleanedRow {
  id: string;
  values: Record<string, string>;
  flags: string[];
}

function cleanRow(record: Record<string, string>, specs: ColumnSpec[], enums: Map<string, readonly string[]>, fixes: Counter) {
  const values: Record<string, string> = {};
  const flags: string[] = [];

  for (const spec of specs) {
    const raw = record[spec.name] ?? "";
    const text = cleanText(raw);
    let value = text.value ?? "";
    if (text.changed) bump(fixes, `whitespace_trimmed:${spec.name}`);

    if (value === "") {
      if (spec.notNull) flags.push(`blank_required:${spec.name}`);
      values[spec.name] = "";
      continue;
    }

    switch (spec.kind) {
      case "text": {
        const allowed = enums.get(spec.name);
        if (!allowed) break;
        const m = matchEnum(value, allowed);
        if (m.value === null) flags.push(`invalid_category:${spec.name}`);
        else {
          if (m.fix !== "none") bump(fixes, `${m.fix === "casing" ? "casing_fixed" : "typo_fixed"}:${spec.name}`);
          value = m.value;
        }
        break;
      }
      case "date":
      case "timestamp": {
        const n = spec.kind === "date" ? normalizeDate(value) : normalizeTimestamp(value);
        if (n.value === null) flags.push(`unparseable_date:${spec.name}`);
        else {
          if (n.changed && !(spec.kind === "date" && value.startsWith(n.value))) bump(fixes, `date_format_normalized:${spec.name}`);
          value = n.value;
        }
        break;
      }
      case "integer":
      case "decimal": {
        const n = parseNumber(value);
        if (n.value === null) flags.push(`invalid_number:${spec.name}`);
        else {
          if (n.changed) bump(fixes, `number_format_normalized:${spec.name}`);
          value = String(n.value);
        }
        break;
      }
      case "boolean": {
        const b = BOOLEAN_WORDS[value.toLowerCase()];
        if (!b) flags.push(`invalid_boolean:${spec.name}`);
        else {
          if (!["True", "False", "true", "false"].includes(value)) bump(fixes, `boolean_format_normalized:${spec.name}`);
          value = b;
        }
        break;
      }
    }
    values[spec.name] = value;
  }
  return { values, flags };
}

async function cleanTable(dir: string, spec: RawTable, knownSupplierIds: Set<string>) {
  const file = path.join(dir, spec.file);
  const specs = columnSpecs(spec.table);
  const enums = new Map(
    Object.values(getTableColumns(spec.table))
      .filter((c) => Array.isArray(c.enumValues) && c.enumValues.length)
      .map((c) => [c.name, c.enumValues as readonly string[]]),
  );

  const records = await readAllCsv(file);
  const { kept, dropped } = dedupeByKey(records, spec.pk);
  const fixes: Counter = {};
  const flagCounts: Counter = {};
  const rows: CleanedRow[] = [];

  for (const record of kept) {
    const { values, flags } = cleanRow(record, specs, enums, fixes);

    if (spec.name === "invoices" && values.supplier_id && !knownSupplierIds.has(values.supplier_id)) {
      flags.push("orphaned_supplier_id");
    }
    if (!flags.length) {
      const parsed = spec.schema.safeParse(convertRow(specs, values));
      if (!parsed.success) flags.push(...parsed.error.issues.map((i) => `schema_invalid:${i.path.join(".")}`));
    }
    flags.forEach((f) => bump(flagCounts, f));
    rows.push({ id: values[spec.pk] || "(blank id)", values, flags });
  }

  const flagged = rows.filter((r) => r.flags.length);
  return {
    rows,
    report: {
      input: path.relative(process.cwd(), file),
      rows_in: records.length,
      duplicates_dropped: dropped.length,
      rows_after_dedupe: kept.length,
      clean_rows: rows.length - flagged.length,
      flagged_rows: flagged.length,
      fixes: sortCounter(fixes),
      flags: sortCounter(flagCounts),
      flagged_samples: flagged.slice(0, MAX_SAMPLES).map((r) => ({ id: r.id, flags: r.flags })),
    },
  };
}

const sortCounter = (c: Counter) => Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]));

async function writeClean(spec: RawTable, rows: CleanedRow[]) {
  const db = getDb();
  const specs = columnSpecs(spec.table);
  const columns = getTableColumns(spec.table);
  const set = Object.fromEntries(
    Object.keys(columns).filter((c) => c !== spec.pk).map((c) => [c, sql.raw(`excluded."${c}"`)]),
  );
  const clean = rows.filter((r) => !r.flags.length).map((r) => convertRow(specs, r.values));
  for (let i = 0; i < clean.length; i += 1_000) {
    await db.insert(spec.table).values(clean.slice(i, i + 1_000)).onConflictDoUpdate({ target: columns[spec.pk], set });
  }
  return clean.length;
}

async function main() {
  const dir = datasetDir();
  const write = hasFlag("--write");
  const report: Record<string, unknown> = { generated_at: new Date().toISOString(), dataset: dir, tables: {} };
  const tables = report.tables as Record<string, unknown>;

  // Orphan check reference: curated suppliers when available, plus the cleaned raw suppliers.
  const knownSupplierIds = new Set<string>();
  const curatedSuppliers = path.join(domainDir(dir, "G_finance"), "suppliers.csv");
  if (existsSync(curatedSuppliers)) {
    for (const r of await readAllCsv(curatedSuppliers)) knownSupplierIds.add(r.supplier_id.trim());
  }

  for (const spec of RAW_TABLES) {
    const { rows, report: tableReport } = await cleanTable(dir, spec, knownSupplierIds);
    if (spec.name === "suppliers") rows.filter((r) => !r.flags.length).forEach((r) => knownSupplierIds.add(r.id));
    tables[spec.name] = tableReport;
    if (write) (tableReport as Record<string, unknown>).rows_written = await writeClean(spec, rows);

    const { fixes, flags, flagged_samples, ...headline } = tableReport;
    console.log(`\n== ${spec.name} ==`);
    console.table(headline);
    console.table(fixes);
    console.table(flags);
    if (flagged_samples.length) console.log(`  e.g. ${flagged_samples[0].id}: ${flagged_samples[0].flags.join(", ")}`);
  }

  const outDir = path.join("scripts", "load-dataset", "out");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "data-quality-report.json");
  await writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outFile}${write ? "" : " (dry run — pass --write to load clean rows)"}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
