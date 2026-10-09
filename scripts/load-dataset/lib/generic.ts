/**
 * Loads every CSV of the non-finance domains (A_workforce, D_risk, …) into
 * SQLite as-is. These have no Drizzle schema: each file becomes a table named
 * after it, with INTEGER/REAL/TEXT column types inferred from the values.
 * Tables are dropped and recreated on every run.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

import { domainDir, readCsv } from "./csv";

type Affinity = "INTEGER" | "REAL" | "TEXT";

// Leading zeros are kept as TEXT so codes like "007" survive.
const INTEGER = /^-?(0|[1-9]\d{0,14})$/;
const REAL = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const BATCH_SIZE = 10_000;
const SKIP_DOMAINS = new Set(["G_finance", "raw", "_docs"]);

const quote = (id: string) => `"${id.replaceAll('"', '""')}"`;

async function inferColumns(file: string) {
  let columns: string[] = [];
  let types: Affinity[] = [];
  for await (const record of readCsv(file)) {
    if (!columns.length) {
      columns = Object.keys(record);
      types = columns.map(() => "INTEGER");
    }
    columns.forEach((c, i) => {
      const v = record[c]?.trim();
      if (!v || types[i] === "TEXT" || (types[i] === "INTEGER" && INTEGER.test(v))) return;
      types[i] = REAL.test(v) ? "REAL" : "TEXT";
    });
  }
  return { columns, types };
}

function toValue(raw: string | undefined, type: Affinity) {
  const v = raw?.trim() ?? "";
  if (v === "") return null;
  return type === "TEXT" ? raw : Number(v);
}

async function loadCsv(client: BetterSqlite3.Database, table: string, file: string) {
  const { columns, types } = await inferColumns(file);
  if (!columns.length) return 0;

  const t = quote(table);
  client.exec(`DROP TABLE IF EXISTS ${t}; CREATE TABLE ${t} (${columns.map((c, i) => `${quote(c)} ${types[i]}`).join(", ")})`);
  const insert = client.prepare(
    `INSERT INTO ${t} (${columns.map(quote).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  );
  const insertMany = client.transaction((rows: unknown[][]) => {
    for (const row of rows) insert.run(row);
  });

  let loaded = 0;
  let batch: unknown[][] = [];
  for await (const record of readCsv(file)) {
    batch.push(columns.map((c, i) => toValue(record[c], types[i])));
    if (batch.length >= BATCH_SIZE) {
      insertMany(batch);
      loaded += batch.length;
      batch = [];
    }
  }
  insertMany(batch);
  return loaded + batch.length;
}

/** Loads all non-finance domain CSVs under `root`. `reserved` holds table names already taken. */
export async function loadOtherDomains(client: BetterSqlite3.Database, root: string, reserved: Set<string>) {
  const summary: Record<string, unknown>[] = [];
  const domains = readdirSync(root).filter((d) => !SKIP_DOMAINS.has(d) && statSync(path.join(root, d)).isDirectory());

  for (const domain of domains) {
    const dir = domainDir(root, domain);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv"))) {
      const table = path.basename(file, ".csv");
      if (reserved.has(table)) throw new Error(`Table name collision: ${domain}/${file} -> ${table}`);
      reserved.add(table);

      const started = Date.now();
      const rows = await loadCsv(client, table, path.join(dir, file));
      summary.push({ domain, table, rows, seconds: ((Date.now() - started) / 1000).toFixed(1) });
    }
  }
  return summary;
}
