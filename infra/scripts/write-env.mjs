// Writes DATABASE_URL (pointing at the local tunnel) and AWS_REGION into
// .env.local, using the RDS-managed master secret. Never prints the password.
// Re-run after RDS rotates the password (every 7 days by default).
// Usage: node infra/scripts/write-env.mjs [localPort=5432]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { fail, readOutputs, repoRoot, run } from "./tf-outputs.mjs";

const localPort = process.argv[2] ?? "5432";
const o = readOutputs();

const secretString = run("aws", [
  "secretsmanager",
  "get-secret-value",
  "--region",
  o.region,
  "--secret-id",
  o.db_master_secret_arn,
  "--query",
  "SecretString",
  "--output",
  "text",
]).trim();

let creds;
try {
  creds = JSON.parse(secretString);
} catch {
  fail("Unexpected secret format (expected JSON with username/password).");
}

const databaseUrl =
  `postgres://${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password)}` +
  `@localhost:${localPort}/${o.db_name}?sslmode=no-verify`;

const envPath = join(repoRoot, ".env.local");
const examplePath = join(repoRoot, ".env.example");
const original = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
  : existsSync(examplePath)
    ? readFileSync(examplePath, "utf8")
    : "";

const updates = { DATABASE_URL: databaseUrl, AWS_REGION: o.region };
const lines = original.split(/\r?\n/);
for (const [key, value] of Object.entries(updates)) {
  const line = `${key}=${value}`;
  const index = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
}

writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"));
console.log(
  `✔ Wrote DATABASE_URL (localhost:${localPort} -> ${o.db_name}) and AWS_REGION=${o.region} to .env.local`,
);
console.log("  Keep `node infra/scripts/db-tunnel.mjs` running while the app uses the database.");
