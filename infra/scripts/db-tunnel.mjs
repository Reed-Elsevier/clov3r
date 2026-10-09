// Opens an SSM port-forward: localhost:<port> -> private RDS Postgres.
// Usage: node infra/scripts/db-tunnel.mjs [localPort=5432]   (keep it running)
import { spawn } from "node:child_process";

import { fail, readOutputs } from "./tf-outputs.mjs";

const localPort = process.argv[2] ?? "5432";
const o = readOutputs();

console.log(
  `Forwarding localhost:${localPort} -> ${o.db_host}:${o.db_port} via ${o.bastion_instance_id}. Press Ctrl+C to stop.`,
);

const child = spawn(
  "aws",
  [
    "ssm",
    "start-session",
    "--region",
    o.region,
    "--target",
    o.bastion_instance_id,
    "--document-name",
    "AWS-StartPortForwardingSessionToRemoteHost",
    "--parameters",
    `host=${o.db_host},portNumber=${o.db_port},localPortNumber=${localPort}`,
  ],
  { stdio: "inherit" },
);

child.on("error", (err) => {
  if (err.code === "ENOENT") fail("'aws' CLI is not installed or not on PATH.");
  fail(err.message);
});
child.on("exit", (code) => process.exit(code ?? 0));
