# Branch Plan: `feat/ingestion-api`

**Depends on:** `feat/data-schema-contract`
**Blocks:** dashboard branches need real data (can start against mocks meanwhile)

## Goal

Get real data into Postgres: both the clean curated tables and a cleaned
version of the dirty raw tables, exposed via read APIs the dashboards use.

## Scope

1. **Bulk loader** (`scripts/load-dataset/load-curated.ts`): streams
   `dataset/G_finance/*.csv` and bulk-inserts into the matching tables from
   `feat/data-schema-contract`, in FK-safe order: `cost_centers` →
   `suppliers` → `supplier_enrollment_requests` → `purchase_orders` →
   `invoices` → `invoice_lines` → `invoice_exceptions` → `payments` →
   `opex_budget_vs_actual`. Idempotent (upsert on PK) so it can be re-run.
2. **Raw cleaning pipeline** (`scripts/load-dataset/clean-raw.ts`) — handles
   the dirty columns documented in `dataset/_docs/06_data_quality_plan.md`
   for `invoices_raw.csv` / `suppliers_raw.csv`:
   - Normalize mixed date formats (ISO / DD-MM-YYYY / "Mon DD, YYYY") in
     `invoice_date`/`received_at`/`onboarded_date`.
   - Trim/fix casing + whitespace on name/channel columns.
   - Drop near-duplicate rows (same PK, whitespace-only variant), keeping the
     earliest `_ingested_at`.
   - Flag (don't silently drop) rows with orphaned `supplier_id` (~1%) —
     surface as a data-quality report, not inserted until resolved.
   - Fill/flag blanked `currency`/`invoice_date`/`category` fields.
   - Output a **data-quality report** (counts fixed/flagged per rule) — this
     doubles as the demo evidence for IDEA.md Stage 1 ("Analyze invoices").
3. **API routes** (`app/api/invoices/route.ts`, `app/api/metrics/route.ts`):
   - `GET /api/invoices` — paginated/filterable list (by supplier, status,
     date range, cost center).
   - `GET /api/metrics` — aggregate KPIs: total invoices, exception rate,
     invoices without PO, average processing time, flagged value — computed
     live from Postgres, compared against the published baselines (19.5%
     exception rate, 6.1% no-PO).
4. Unit tests for the date-normalization and dedupe logic using small
   hand-crafted fixtures (don't need the full dataset for this).

## Definition of Done

- Running the loader against `dataset/G_finance` populates Postgres with
  consistent row counts (spot-check against `dataset/_docs/validation_report.json`).
- Running the raw cleaner against `dataset/raw/invoices_raw.csv` produces a
  report showing fixed/flagged counts in the same ballpark as
  `dataset/_docs/06_data_quality_plan.md`'s injection log.
- `/api/invoices` and `/api/metrics` return typed JSON matching the Zod
  schemas from `feat/data-schema-contract`.

## Notes

- Given dataset scale (millions of rows across all domains), confirm actual
  row counts for just the finance tables before deciding whether to load
  100% or a representative slice for local/dev Postgres.
- This loader is explicitly **not** meant to run inside the Next.js request
  path — it's an offline/CLI script, invoked manually or via a one-off ECS
  task in deployed environments.
