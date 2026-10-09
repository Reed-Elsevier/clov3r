const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { buildEnvironment } = require("../ecs/web-entrypoint.cjs");

const credentials = { username: "invoiceiq_admin", password: "test@:/?#%[] secret" };
const environment = {
  ...process.env,
  DB_CREDENTIALS: JSON.stringify(credentials),
  DB_HOST: "db.example.internal",
  DB_NAME: "invoiceiq",
  ANOMALY_ENGINE_URL: "http://anomaly-engine.invoiceiq-dev.internal:8000",
  BEDROCK_MODEL_ID: "test-model",
};

test("database URL escapes credentials and preserves deployed settings", () => {
  const result = buildEnvironment(environment);
  const parsed = new URL(result.DATABASE_URL);
  assert.equal(decodeURIComponent(parsed.username), credentials.username);
  assert.equal(decodeURIComponent(parsed.password), credentials.password);
  assert.equal(parsed.hostname, environment.DB_HOST);
  assert.equal(parsed.port, "5432");
  assert.equal(parsed.pathname, "/invoiceiq");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(result.ANOMALY_ENGINE_URL, environment.ANOMALY_ENGINE_URL);
  assert.equal(result.BEDROCK_MODEL_ID, environment.BEDROCK_MODEL_ID);
  assert.equal(result.DB_CREDENTIALS, undefined);
  assert.equal(environment.DB_CREDENTIALS, JSON.stringify(credentials));
});

test("ECS node -e invocation forwards DATABASE_URL to the production command", () => {
  const source = readFileSync(require.resolve("../ecs/web-entrypoint.cjs"), "utf8");
  const childCheck = "require('node:assert/strict').ok(process.env.DATABASE_URL); require('node:assert/strict').equal(process.env.DB_CREDENTIALS, undefined); process.exit(7)";
  const result = spawnSync(process.execPath, ["-e", source, "--", process.execPath, "-e", childCheck], {
    env: environment,
    encoding: "utf8",
  });
  assert.equal(result.status, 7, result.stderr);
  assert.equal(result.stdout, "");
});

test("malformed secrets fail without logging their contents", () => {
  const source = readFileSync(require.resolve("../ecs/web-entrypoint.cjs"), "utf8");
  const result = spawnSync(process.execPath, ["-e", source, "--", process.execPath], {
    env: { ...environment, DB_CREDENTIALS: "not-json-test-secret" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unable to initialize database settings/);
  assert.ok(!result.stderr.includes("not-json-test-secret"));
});