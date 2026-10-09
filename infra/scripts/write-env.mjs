// Sets up .env.local to use the shared RDS Postgres, then tests the connection.
// Needs only Node + npm packages (no AWS CLI / Terraform on the laptop) and
// AWS credentials copied from your SSO access portal (see infra/README.md).
// Never prints the password. Re-run after RDS rotates it (every 7 days).
//
// Usage: node infra/scripts/write-env.mjs [--identifier invoiceiq-dev-postgres] [--region <aws-region>]
//   Region defaults to AWS_REGION (from your shell or .env.local), else ap-southeast-1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { DescribeDBInstancesCommand, RDSClient } from "@aws-sdk/client-rds";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { config as loadEnv } from "dotenv";
import pg from "pg";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(repoRoot);
// Lets AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN / AWS_PROFILE live in .env.local.
loadEnv({ path: [".env.local", ".env"], quiet: true });

const { values: args } = parseArgs({
  options: {
    identifier: { type: "string", default: "invoiceiq-dev-postgres" },
    region: { type: "string", default: process.env.AWS_REGION || "ap-southeast-1" },
  },
});

const CA_PATH = ".certs/rds-ca-bundle.pem";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function explainAwsError(err) {
  const name = err?.name ?? "";
  if (name === "CredentialsProviderError" || /credential/i.test(err?.message ?? "")) {
    return "No AWS credentials found. Copy temporary credentials from your SSO access portal (see infra/README.md, step 3).";
  }
  if (/ExpiredToken|InvalidClientTokenId|UnrecognizedClient/i.test(name)) {
    return "Your AWS credentials expired. Copy fresh ones from the SSO access portal.";
  }
  if (name === "DBInstanceNotFoundFault") {
    return `RDS instance '${args.identifier}' not found in ${args.region}. Has the stack been applied? (infra/README.md, step 2)`;
  }
  if (/AccessDenied/i.test(name)) {
    return `Access denied: ${err.message}\nYour SSO role needs rds:DescribeDBInstances and secretsmanager:GetSecretValue on the DB secret.`;
  }
  return `${name}: ${err?.message}`;
}

async function publicIp() {
  try {
    const res = await fetch("https://checkip.amazonaws.com", { signal: AbortSignal.timeout(5000) });
    return (await res.text()).trim();
  } catch {
    return "unknown";
  }
}

// 1. Look up the instance and its RDS-managed secret.
const rds = new RDSClient({ region: args.region });
let instance;
try {
  const out = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: args.identifier }));
  instance = out.DBInstances?.[0];
} catch (err) {
  fail(explainAwsError(err));
}
if (!instance?.Endpoint?.Address) fail(`RDS instance '${args.identifier}' has no endpoint yet (status: ${instance?.DBInstanceStatus}). Try again in a few minutes.`);
if (!instance.MasterUserSecret?.SecretArn) fail("RDS instance has no managed master secret (expected manage_master_user_password).");
if (!instance.PubliclyAccessible) fail("RDS instance is not publicly accessible. Add your IP to db_allowed_cidrs and re-apply (infra/README.md).");

// 2. Read the credentials.
const secrets = new SecretsManagerClient({ region: args.region });
let creds;
try {
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: instance.MasterUserSecret.SecretArn }));
  creds = JSON.parse(out.SecretString ?? "");
} catch (err) {
  fail(err instanceof SyntaxError ? "Unexpected secret format (expected JSON with username/password)." : explainAwsError(err));
}

// 3. Download the RDS CA bundle so TLS is fully verified (sslmode=verify-full).
try {
  const res = await fetch(`https://truststore.pki.rds.amazonaws.com/${args.region}/${args.region}-bundle.pem`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  mkdirSync(dirname(CA_PATH), { recursive: true });
  writeFileSync(CA_PATH, await res.text());
} catch (err) {
  fail(`Could not download the RDS CA bundle: ${err.message}`);
}

const { Address: host, Port: port } = instance.Endpoint;
const databaseUrl =
  `postgres://${encodeURIComponent(creds.username)}:${encodeURIComponent(creds.password)}` +
  `@${host}:${port}/${instance.DBName}?sslmode=verify-full&sslrootcert=${CA_PATH}`;

// 4. Update .env.local (created from .env.example if missing), keeping other keys.
const envPath = ".env.local";
const original = existsSync(envPath) ? readFileSync(envPath, "utf8") : existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
const lines = original.split(/\r?\n/);
for (const [key, value] of Object.entries({ DATABASE_URL: databaseUrl, AWS_REGION: args.region })) {
  const index = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}
writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"));
console.log(`✔ Wrote DATABASE_URL (${host}/${instance.DBName}) and AWS_REGION=${args.region} to .env.local`);

// 5. Test the connection.
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const { rows } = await client.query("select current_user as user, split_part(version(), ' ', 2) as version");
  console.log(`✔ Connected as ${rows[0].user} (PostgreSQL ${rows[0].version}). Next: npm run db:migrate`);
} catch (err) {
  const ip = await publicIp();
  if (err.code === "28P01") {
    fail("Password rejected. RDS may have just rotated it. Wait a minute and re-run this script.");
  } else if (/timeout|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH/i.test(`${err.code} ${err.message}`)) {
    fail(
      `Could not reach ${host}:${port}. Your public IP is ${ip}. Make sure "${ip}/32" is in db_allowed_cidrs ` +
        "(infra/terraform.tfvars) and the stack was re-applied. Also check that your network allows outbound port 5432.",
    );
  } else {
    fail(`Connection failed: ${err.code ?? ""} ${err.message}`);
  }
} finally {
  await client.end().catch(() => {});
}
