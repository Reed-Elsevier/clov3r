/**
 * The shared data contract for InvoiceIQ AI.
 *
 * Import Zod schemas (runtime validation) and inferred types from here:
 *   import { invoiceSchema, type Invoice } from "@/lib/schemas";
 *
 * Every row schema is kept identical to its Drizzle table in
 * `lib/db/schema.ts` by the compile-time checks in `./parity.ts`.
 */
export * from "./enums";
export * from "./common";
export * from "./finance";
export * from "./anomalies";
export * from "./api";
