/**
 * Loads env files for code running outside the Next.js runtime (drizzle-kit,
 * `scripts/*`). Mirrors Next's precedence: `.env.local` overrides `.env`, and
 * already-set process env vars win over both.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
