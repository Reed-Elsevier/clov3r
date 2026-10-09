/**
 * Batch-generates AI explanations for anomalies that don't have one yet
 * (PLAN-05 note: run after detection, not on dashboard page load).
 *
 *   npm run ai:explain                 # up to 50 anomalies, highest priority first
 *   npm run ai:explain -- --limit 200
 *
 * Requires DATABASE_URL, BEDROCK_MODEL_ID and AWS credentials.
 */
import "../lib/db/load-env";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { closeDb, getDb } from "../lib/db/client";
import { anomalies, anomalyExplanations } from "../lib/db/schema";
import { bedrockModelId } from "../lib/bedrock/client";
import { ExplanationRejectedError } from "../lib/explanations/generate";
import { explainAnomaly } from "../lib/explanations/service";
import { dbStore } from "../lib/explanations/store";

async function main() {
  if (!bedrockModelId()) throw new Error("BEDROCK_MODEL_ID is not set — refusing to store offline template explanations in the database.");
  const i = process.argv.indexOf("--limit");
  const limit = Math.max(1, Number(i >= 0 ? process.argv[i + 1] : 50) || 50);

  const pending = await getDb()
    .select({ id: anomalies.anomaly_id })
    .from(anomalies)
    .leftJoin(anomalyExplanations, eq(anomalyExplanations.anomaly_id, anomalies.anomaly_id))
    .where(and(isNull(anomalyExplanations.anomaly_id), sql`${anomalies.status} in ('Needs review', 'Investigating')`))
    .orderBy(sql`case ${anomalies.priority} when 'High' then 0 when 'Medium' then 1 else 2 end`, asc(anomalies.created_at))
    .limit(limit);

  console.log(`Explaining ${pending.length} anomaly(ies) with ${bedrockModelId()}`);
  let ok = 0;
  const failed: string[] = [];
  for (const { id } of pending) {
    try {
      await explainAnomaly(id, { store: dbStore });
      ok++;
    } catch (err) {
      failed.push(`${id}: ${err instanceof ExplanationRejectedError ? err.reasons.join(" | ") : (err as Error).message}`);
    }
  }

  console.log(`Generated ${ok}, failed ${failed.length}`);
  failed.forEach((f) => console.warn(`  ${f}`));
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
