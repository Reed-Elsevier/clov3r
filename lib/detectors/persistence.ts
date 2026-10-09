import "server-only";
import { getDb, schema, type Database } from "../db/client";
import { newAnomalySchema, type NewAnomaly } from "../schemas";

export function prepareAnomalies(rows: NewAnomaly[]): NewAnomaly[] {
  const seen = new Set<string>();
  return rows.map((row) => newAnomalySchema.parse(row)).filter((row) => {
    if (row.status && row.status !== "Needs review") throw new Error("Detectors cannot set human review outcomes");
    const key = JSON.stringify([row.invoice_id, row.method, row.category]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row) => ({ ...row, status: "Needs review" }));
}

export async function saveAnomalies(rows: NewAnomaly[], database?: Database): Promise<number> {
  const prepared = prepareAnomalies(rows);
  if (prepared.length === 0) return 0;
  const db = database ?? getDb();
  return db.transaction((transaction) => {
    let inserted = 0;
    for (let start = 0; start < prepared.length; start += 500) {
      inserted += transaction.insert(schema.anomalies).values(prepared.slice(start, start + 500))
        .onConflictDoNothing({ target: [schema.anomalies.invoice_id, schema.anomalies.method, schema.anomalies.category] })
        .returning({ anomaly_id: schema.anomalies.anomaly_id })
        .all().length;
    }
    return inserted;
  });
}