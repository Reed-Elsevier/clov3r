# scripts/load-dataset

> **Stub** — created by `feat/data-schema-contract`; the loaders are
> implemented in `feat/ingestion-api` (see
> [PLAN-02](../../docs/PLAN-02-ingestion-api.md)).

## Data source

The loaders read the dataset **directly from disk** — the CSVs are never
copied into source control (`/dataset` is git-ignored):

| Input | Target |
|---|---|
| `dataset/G_finance/*.csv` | The 9 finance tables in [`lib/db/schema.ts`](../../lib/db/schema.ts), loaded as-is |
| `dataset/raw/invoices_raw.csv`, `dataset/raw/suppliers_raw.csv` | Cleaning/validation pipeline (Stage 1 demo), then `invoices`/`suppliers` |

Place the extracted dataset at the repo root as `dataset/` before running.

## Load order (FK-safe)

`cost_centers` → `suppliers` → `supplier_enrollment_requests` →
`purchase_orders` → `invoices` → `invoice_lines` → `invoice_exceptions` →
`payments` → `opex_budget_vs_actual`

## CSV → column conversions

CSV headers match the table column names exactly. Values need these
conversions on load:

| Dataset type | CSV example | Postgres value |
|---|---|---|
| `date` | `2026-03-12 00:00:00` | `2026-03-12` (drop the time part) |
| `timestamp` | `2026-03-16 04:34:08` | unchanged (`timestamp` without time zone) |
| `boolean` | `True` / `False` | `true` / `false` |
| empty cell | `` | `NULL` (e.g. `invoices.po_id`, `invoices.ocr_confidence`, `invoice_exceptions.resolved_at`) |

## Row counts (from `dataset/_docs/validation_report.json`)

| Table | Rows |
|---|---|
| cost_centers | 57 |
| suppliers | 2,400 |
| supplier_enrollment_requests | 3,000 |
| purchase_orders | 40,000 |
| invoices | 120,000 |
| invoice_lines | 406,814 |
| invoice_exceptions | 23,400 |
| payments | 107,249 |
| opex_budget_vs_actual | 3,249 |

## Prerequisites

1. `cp .env.example .env.local` and set `DATABASE_URL`.
2. Create the schema: `npm run db:migrate` (applies `drizzle/` migrations).
