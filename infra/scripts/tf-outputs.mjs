// Shared helpers for the infra scripts: read `terraform output` from infra/.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const infraDir = join(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = join(infraDir, "..");

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Runs a CLI and returns stdout; stderr streams to the terminal. */
export function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (err) {
    if (err.code === "ENOENT") fail(`'${cmd}' is not installed or not on PATH.`);
    fail(
      `'${cmd} ${args[0]}' failed. Is your AWS session active? Try: aws sso login` +
        (process.env.AWS_PROFILE ? ` --profile ${process.env.AWS_PROFILE}` : ""),
    );
  }
}

export function readOutputs() {
  const raw = run("terraform", [`-chdir=${infraDir}`, "output", "-json"]);
  const outputs = Object.fromEntries(
    Object.entries(JSON.parse(raw)).map(([key, { value }]) => [key, value]),
  );
  if (!outputs.db_host) {
    fail(
      "No Terraform outputs found. Run `terraform -chdir=infra init -backend-config=backend.hcl` " +
        "(and `apply`, if nobody has yet). See infra/README.md.",
    );
  }
  return outputs;
}
