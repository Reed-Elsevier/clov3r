/**
 * Pure CSV-cell -> Postgres-value conversions for the curated G_finance CSVs
 * (see scripts/load-dataset/README.md "CSV -> column conversions"). Shared by
 * the PLAN-02 loader and the PLAN-03 detectors' CSV reader.
 *
 * Column kinds are derived from the Drizzle tables, so readers can never
 * drift from lib/db/schema.ts.
 */
import { getTableColumns, type Table } from "drizzle-orm";

export type ColumnKind = "text" | "integer" | "decimal" | "boolean" | "date" | "timestamp";

export interface ColumnSpec {
  name: string;
  kind: ColumnKind;
  notNull: boolean;
}

const KIND_BY_COLUMN_TYPE: Record<string, ColumnKind> = {
  PgText: "text",
  PgInteger: "integer",
  PgNumericNumber: "decimal",
  PgBoolean: "boolean",
  PgDateString: "date",
  PgTimestampString: "timestamp",
};

export function columnSpecs(table: Table): ColumnSpec[] {
  return Object.values(getTableColumns(table)).map((col) => {
    const kind = KIND_BY_COLUMN_TYPE[col.columnType];
    if (!kind) throw new Error(`Unsupported column type ${col.columnType} for ${col.name}`);
    return { name: col.name, kind, notNull: col.notNull };
  });
}

export class ConversionError extends Error {
  constructor(
    readonly column: string,
    readonly value: string,
    reason: string,
  ) {
    super(`${column}: ${reason} (got "${value}")`);
  }
}

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export function convertCell(spec: ColumnSpec, raw: string | undefined): string | number | boolean | null {
  const value = raw?.trim() ?? "";
  if (value === "") {
    if (spec.notNull) throw new ConversionError(spec.name, value, "required value is empty");
    return null;
  }

  switch (spec.kind) {
    case "text":
      return value;
    case "integer": {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new ConversionError(spec.name, value, "not an integer");
      return n;
    }
    case "decimal": {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new ConversionError(spec.name, value, "not a number");
      return n;
    }
    case "boolean": {
      const v = value.toLowerCase();
      if (v === "true") return true;
      if (v === "false") return false;
      throw new ConversionError(spec.name, value, "not a boolean");
    }
    case "date": {
      const m = DATE_PREFIX.exec(value);
      if (!m) throw new ConversionError(spec.name, value, "not a YYYY-MM-DD date");
      return m[1];
    }
    case "timestamp":
      if (!TIMESTAMP.test(value)) throw new ConversionError(spec.name, value, "not a YYYY-MM-DD HH:MM:SS timestamp");
      return value.replace("T", " ");
  }
}

/** Converts one CSV record into a row keyed by column name. Extra CSV columns are ignored. */
export function convertRow(specs: ColumnSpec[], record: Record<string, string>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const spec of specs) row[spec.name] = convertCell(spec, record[spec.name]);
  return row;
}
