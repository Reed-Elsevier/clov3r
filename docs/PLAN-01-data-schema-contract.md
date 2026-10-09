# Branch Plan: `feat/data-schema-contract`

**Depends on:** nothing (merges to `main` first — everything else branches off after this lands)
**Blocks:** every other branch

## Goal

Establish the single shared contract — DB schema, TypeScript/Zod types, and
loaded fixture data — so the other 10 branches can be built in parallel
without colliding on "what does an invoice/anomaly object look like."

## Scope

1. **Drizzle ORM schema** (`lib/db/schema.ts`) mirroring the dataset's
   `G_finance` domain tables exactly (same column names/types as
   `dataset/_docs/03_data_dictionary.md`):
   - `cost_centers`, `suppliers`, `supplier_enrollment_requests`,
     `purchase_orders`, `invoices`, `invoice_lines`, `invoice_exceptions`,
     `payments`, `opex_budget_vs_actual`
   - Plus two new app-native tables:
     - `anomalies` — `anomaly_id (PK), invoice_id (FK), method ('rule'|'statistical'|'isolation_forest'), category, priority ('High'|'Medium'|'Low'), score, evidence (jsonb), status ('Needs review'|'Investigating'|'Resolved'|'Dismissed'), created_at`
     - `anomaly_explanations` — `anomaly_id (PK/FK), explanation, potential_impact, recommended_actions (jsonb string[]), preventive_measure, model_id, generated_at`
2. **DB client** (`lib/db/client.ts`) — pg + drizzle connection using
   `DATABASE_URL` env var (will point at RDS Postgres in deployed envs, local
   Postgres/docker in dev).
3. **Zod schemas + inferred TS types** (`lib/schemas/*.ts`) for every table
   above, used both for API request/response validation and for typing
   dashboard props. These are the "contract" other branches import.
4. **`drizzle.config.ts`** for running `drizzle-kit generate`/`push`
   migrations.
5. **`.env.example`** documenting required vars: `DATABASE_URL`,
   `AWS_REGION`, `BEDROCK_MODEL_ID`, `ANOMALY_ENGINE_URL`.
6. **package.json** — add `drizzle-orm`, `drizzle-kit`, `pg`, `zod`,
   `dotenv`, `@types/pg`.
7. **Seed/fixture note**: do *not* copy the raw CSVs into source control.
   Document (in `scripts/load-dataset/README.md`, written here as a stub that
   `feat/ingestion-api` fills in) that the loader reads directly from
   `dataset/G_finance/*.csv` on disk.

## Definition of Done

- `npx drizzle-kit generate` produces a valid migration with no errors.
- Every column in the data dictionary for the 9 G_finance tables is present
  with a matching type.
- Zod schemas exported from `lib/schemas/index.ts` and documented with a short
  JSDoc comment per field where the meaning isn't obvious from the name.
- PR description lists the full table/column contract so the other two
  developers can start immediately.

## Notes

- Keep `anomalies.evidence` as freeform `jsonb` — evidence shape differs by
  category (e.g. duplicate evidence references a second `invoice_id`;
  statistical-outlier evidence references a z-score and comparison group).
  Document the expected keys per category in a comment, not a rigid schema,
  since this will evolve as `feat/anomaly-rules` and `feat/anomaly-engine-ml`
  land.
