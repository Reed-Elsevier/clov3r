import "./lib/db/load-env";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only needed for `push`/`migrate`/`studio`; `generate` works offline.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
