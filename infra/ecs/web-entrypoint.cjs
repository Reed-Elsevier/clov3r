const { spawn } = require("node:child_process");

function buildEnvironment(environment) {
  const credentials = JSON.parse(environment.DB_CREDENTIALS);
  if (!credentials.username || !credentials.password || !environment.DB_HOST || !environment.DB_NAME) {
    throw new Error("Missing database connection settings");
  }
  const databaseUrl = new URL("postgresql://localhost");
  databaseUrl.hostname = environment.DB_HOST;
  databaseUrl.port = "5432";
  databaseUrl.pathname = `/${environment.DB_NAME}`;
  databaseUrl.username = encodeURIComponent(credentials.username);
  databaseUrl.password = encodeURIComponent(credentials.password);
  databaseUrl.searchParams.set("sslmode", "require");
  const childEnvironment = { ...environment, DATABASE_URL: databaseUrl.toString() };
  delete childEnvironment.DB_CREDENTIALS;
  return childEnvironment;
}

function start() {
  let environment;
  try {
    environment = buildEnvironment(process.env);
  } catch {
    console.error("Unable to initialize database settings from the injected secret");
    process.exit(1);
  }
  const [command, ...argumentsList] = process.argv.slice(1);
  if (!command) {
    console.error("Missing web start command");
    process.exit(1);
  }
  const child = spawn(command, argumentsList, { env: environment, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", () => {
    console.error("Unable to start web application");
    process.exit(1);
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

module.exports = { buildEnvironment };
if (require.main === module || process.argv[0] === process.execPath && require.main === undefined) {
  start();
}