import "./lib/db/load-env";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_PATH || "data/clov3r.db",
  },
  strict: true,
  verbose: true,
});
