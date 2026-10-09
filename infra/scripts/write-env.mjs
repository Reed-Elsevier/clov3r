// Sets up .env.local to use the shared AWS Postgres (Aurora PostgreSQL cluster
// or a plain RDS instance), then tests the connection.
// Needs only Node + npm packages (no AWS CLI / Terraform on the laptop) and
// AWS credentials copied from your SSO access portal (see infra/README.md).
// Never prints the password. If the password is managed by Secrets Manager,
// re-run this after RDS rotates it (every 7 days by default).
//
// Usage: node infra/scripts/write-env.mjs [--identifier invoiceiq-dev-postgres] [--region <aws-region>] [--database invoiceiq]
//   --identifier  Aurora cluster or RDS instance identifier
//   --region      defaults to AWS_REGION (from your shell or .env.local), else ap-southeast-1
//   --database    created on first run if it doesn't exist yet
// Without a Secrets Manager-managed password you'll be prompted for it (or set DB_PASSWORD).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { DescribeDBClustersCommand, DescribeDBInstancesCommand, RDSClient } from "@aws-sdk/client-rds";
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
    database: { type: "string", default: "invoiceiq" },
  },
});

const CA_PATH = ".certs/rds-ca-bundle.pem";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function explainAwsError(err) {
  const name = err?.name ?? "";
  if (name === "CredentialsProviderError" || /could not load credentials/i.test(err?.message ?? "")) {
    return "No AWS credentials found. Copy temporary credentials from your SSO access portal into .env.local (see infra/README.md, step 3).";
  }
  if (/ExpiredToken|InvalidClientTokenId|UnrecognizedClient/i.test(name)) {
    return "Your AWS credentials are expired or invalid. Copy fresh ones from the SSO access portal into .env.local.";
  }
  if (/AccessDenied/i.test(name)) {
    return `Access denied: ${err.message}\nYour SSO role needs rds:DescribeDBClusters, rds:DescribeDBInstances and secretsmanager:GetSecretValue.`;
  }
  return `${name}: ${err?.message}`;
}

async function aws(promise) {
  try {
    return await promise;
  } catch (err) {
    if (/NotFound/.test(err?.name ?? "")) return null;
    fail(explainAwsError(err));
  }
}

async function publicIp() {
  try {
    const res = await fetch("https://checkip.amazonaws.com", { signal: AbortSignal.timeout(5000) });
    return (await res.text()).trim();
  } catch {
    return "unknown";
  }
}

function promptHidden(question) {
  if (!process.stdin.isTTY) fail("No Secrets Manager-managed password found. Set DB_PASSWORD or run this in an interactive terminal.");
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    rl._writeToOutput = () => {}; // don't echo what's typed
  });
}

// 1. Find the database: Aurora cluster first, then standalone RDS instance.
const rds = new RDSClient({ region: args.region });
let target; // { kind, id, host, port, dbName, username, secretArn, publicInstances, privateInstances, securityGroups }

let cluster = (await aws(rds.send(new DescribeDBClustersCommand({ DBClusterIdentifier: args.identifier }))))?.DBClusters?.[0];
let instance = null;
if (!cluster) {
  instance = (await aws(rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: args.identifier }))))?.DBInstances?.[0];
  if (instance?.DBClusterIdentifier) {
    cluster = (await aws(rds.send(new DescribeDBClustersCommand({ DBClusterIdentifier: instance.DBClusterIdentifier }))))?.DBClusters?.[0];
    instance = null;
  }
}

if (cluster) {
  const memberIds = (cluster.DBClusterMembers ?? []).map((m) => m.DBInstanceIdentifier);
  const members = memberIds.length
    ? ((await aws(rds.send(new DescribeDBInstancesCommand({ Filters: [{ Name: "db-cluster-id", Values: [cluster.DBClusterIdentifier] }] }))))?.DBInstances ?? [])
    : [];
  const writerId = cluster.DBClusterMembers?.find((m) => m.IsClusterWriter)?.DBInstanceIdentifier;
  const writer = members.find((m) => m.DBInstanceIdentifier === writerId);
  target = {
    kind: "Aurora cluster",
    id: cluster.DBClusterIdentifier,
    status: cluster.Status,
    host: cluster.Endpoint,
    port: cluster.Port,
    dbName: cluster.DatabaseName,
    username: cluster.MasterUsername,
    secretArn: cluster.MasterUserSecret?.SecretArn,
    writerId,
    writerPublic: writer?.PubliclyAccessible,
    securityGroups: (cluster.VpcSecurityGroups ?? []).map((g) => g.VpcSecurityGroupId),
  };
  if (!writerId) fail(`Aurora cluster '${target.id}' has no writer instance yet. Add one (or wait for it) and re-run.`);
} else if (instance) {
  target = {
    kind: "RDS instance",
    id: instance.DBInstanceIdentifier,
    status: instance.DBInstanceStatus,
    host: instance.Endpoint?.Address,
    port: instance.Endpoint?.Port,
    dbName: instance.DBName,
    username: instance.MasterUsername,
    secretArn: instance.MasterUserSecret?.SecretArn,
    writerId: instance.DBInstanceIdentifier,
    writerPublic: instance.PubliclyAccessible,
    securityGroups: (instance.VpcSecurityGroups ?? []).map((g) => g.VpcSecurityGroupId),
  };
} else {
  fail(`No Aurora cluster or RDS instance named '${args.identifier}' in ${args.region}. Pass --identifier <name> (and --region) if it's named differently.`);
}

console.log(`• Found ${target.kind} '${target.id}' (${target.status}) in ${args.region}`);
if (!target.host) fail(`'${target.id}' has no endpoint yet (status: ${target.status}). Try again in a few minutes.`);
if (!target.writerPublic) {
  fail(
    `Instance '${target.writerId}' is not publicly accessible, so your laptop can't reach it.\n` +
      `  RDS console → Databases → ${target.writerId} → Modify → Connectivity → Publicly accessible: Yes → Apply immediately.\n` +
      `  Then allow your IP on port 5432 in security group(s): ${target.securityGroups.join(", ") || "(none)"}.`,
  );
}

// 2. Credentials: Secrets Manager-managed secret, else DB_PASSWORD / prompt.
let username = target.username;
let password;
if (target.secretArn) {
  const out = await aws(new SecretsManagerClient({ region: args.region }).send(new GetSecretValueCommand({ SecretId: target.secretArn })));
  try {
    ({ username, password } = JSON.parse(out?.SecretString ?? ""));
  } catch {
    fail("Unexpected secret format (expected JSON with username/password).");
  }
  console.log("• Using the password from AWS Secrets Manager");
} else {
  password = process.env.DB_PASSWORD || (await promptHidden(`Password for database user '${username}': `));
  if (!password) fail("No password entered.");
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

const urlFor = (database) =>
  `postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}` +
  `@${target.host}:${target.port}/${encodeURIComponent(database)}?sslmode=verify-full&sslrootcert=${CA_PATH}`;

async function withClient(database, fn) {
  const client = new pg.Client({ connectionString: urlFor(database), connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function explainConnectError(err) {
  if (err.code === "28P01") {
    return target.secretArn
      ? "Password rejected. RDS may have just rotated it. Wait a minute and re-run this script."
      : `Password rejected for user '${username}'. Re-run and try again.`;
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH/i.test(`${err.code} ${err.message}`)) {
    const ip = await publicIp();
    return (
      `Could not reach ${target.host}:${target.port}. Your public IP is ${ip}.\n` +
      `  Allow it: EC2 console → Security Groups → ${target.securityGroups.join(", ") || "(the DB's security group)"} → ` +
      `Edit inbound rules → PostgreSQL (5432) from ${ip}/32.\n` +
      "  Also check that your network allows outbound port 5432."
    );
  }
  return `Connection failed: ${err.code ?? ""} ${err.message}`;
}

// 4. Connect; create the target database on first run if it's missing.
const database = args.database;
try {
  await withClient(database, async () => {});
} catch (err) {
  if (err.code !== "3D000") fail(await explainConnectError(err));
  console.log(`• Database '${database}' doesn't exist yet, creating it`);
  try {
    await withClient("postgres", (c) => c.query(`create database "${database.replaceAll('"', '""')}"`));
  } catch (createErr) {
    fail(await explainConnectError(createErr));
  }
}

let info;
try {
  info = await withClient(database, async (c) => (await c.query("select current_user as user, split_part(version(), ' ', 2) as version")).rows[0]);
} catch (err) {
  fail(await explainConnectError(err));
}

// 5. Update .env.local (created from .env.example if missing), keeping other keys.
const envPath = ".env.local";
const original = existsSync(envPath) ? readFileSync(envPath, "utf8") : existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
const lines = original.split(/\r?\n/);
for (const [key, value] of Object.entries({ DATABASE_URL: urlFor(database), AWS_REGION: args.region })) {
  const index = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}
writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"));

console.log(`✔ Connected as ${info.user} (PostgreSQL ${info.version}) to ${target.host}/${database}`);
console.log("✔ Wrote DATABASE_URL and AWS_REGION to .env.local. Next: npm run db:migrate");
