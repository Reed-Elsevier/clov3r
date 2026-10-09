import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";

/** Root of the extracted dataset: `--dataset <dir>`, `DATASET_DIR`, or `<repo>/datasets`. */
export function datasetDir(argv = process.argv): string {
  const i = argv.indexOf("--dataset");
  const dir = path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : process.env.DATASET_DIR || "datasets");
  if (!existsSync(dir)) {
    throw new Error(`Dataset folder not found at ${dir}. Extract it to ./datasets or pass --dataset <dir> / set DATASET_DIR.`);
  }
  return dir;
}

/** Folder holding a domain's CSVs; supports both `<root>/G_finance` and the zip-extracted `<root>/G_finance/G_finance`. */
export function domainDir(root: string, domain: string): string {
  const nested = path.join(root, domain, domain);
  return existsSync(nested) ? nested : path.join(root, domain);
}

/** Streams a headered CSV as raw string records (no type coercion). */
export function readCsv(file: string): AsyncIterable<Record<string, string>> {
  if (!existsSync(file)) throw new Error(`CSV not found: ${file}`);
  return createReadStream(file).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }),
  );
}

export async function readAllCsv(file: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for await (const r of readCsv(file)) rows.push(r);
  return rows;
}

export function hasFlag(name: string, argv = process.argv): boolean {
  return argv.includes(name);
}
