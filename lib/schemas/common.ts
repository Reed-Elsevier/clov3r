import { z } from "zod";

/** Calendar date as returned by Postgres `date` columns: `YYYY-MM-DD`. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date formatted as YYYY-MM-DD");

/**
 * Timestamp string. Accepts Postgres output (`YYYY-MM-DD HH:MM:SS[.fff][+00]`)
 * and ISO-8601 (`YYYY-MM-DDTHH:MM:SS[.fff][Z|+hh:mm]`). Dataset timestamps
 * have no offset; app-generated ones (`created_at`, `generated_at`) do.
 */
export const timestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)?$/,
    "Expected a timestamp formatted as YYYY-MM-DD HH:MM:SS or ISO-8601",
  );

/** Dataset `decimal` columns (Postgres `numeric`) are exposed as JS numbers. */
export const decimalSchema = z.number();

export const integerSchema = z.number().int();

/** Dataset identifiers (e.g. `INV0000001`, `SUP000001`) are non-empty strings. */
export const idSchema = z.string().min(1);
