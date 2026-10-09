# scripts/load-dataset

Offline CLI loaders for the REPH dataset ([PLAN-02](../../docs/PLAN-02-ingestion-api.md)).
They are **not** part of the Next.js request path.

| Command | What it does |
|---|---|
| `npm run data:load` | Upserts the 9 curated `G_finance` CSVs into Postgres (FK-safe order, idempotent). Add `-- --tables suppliers,invoices` to load a subset. |
| `npm run data:clean-raw` | Cleans `raw/suppliers_raw.csv` + `raw/invoices_raw.csv` and writes `scripts/load-dataset/out/data-quality-report.json` (dry run, no DB needed). |
| `npm run data:clean-raw -- --write` | Same, and upserts the rows that passed every check into `suppliers`/`invoices`. |
| `npm test` | Unit tests for date normalisation, dedupe, enum/typo matching and CSV conversions. |

Both loaders accept `-- --dataset <dir>` (or `DATASET_DIR`) if the dataset isn't at `./dataset`.
Every row is validated against the shared Zod schema before insert; rejected rows are listed
and the command exits non-zero. The curated loader prints loaded vs. expected row counts.

### Raw cleaning rules (`clean-raw.ts`)

| Rule | Action | Report key |
|---|---|---|
| Mixed date formats (ISO / `DD-MM-YYYY` / `Mon DD, YYYY`) | Normalised | `fixes.date_format_normalized:<col>` |
| Leading/trailing/double whitespace | Trimmed | `fixes.whitespace_trimmed:<col>` |
| Categorical casing (`email` -> `Email`) | Fixed | `fixes.casing_fixed:<col>` |
| Categorical typo within 2 edits, unambiguous | Fixed | `fixes.typo_fixed:<col>` |
| Thousands separators in numbers | Normalised | `fixes.number_format_normalized:<col>` |
| Near-duplicate rows (same PK after trim) | Dropped, earliest `_ingested_at` kept | `duplicates_dropped` |
| Blank required field (`currency`, `invoice_date`, `category`, …) | **Flagged**, not guessed | `flags.blank_required:<col>` |
| `supplier_id` not in curated or cleaned suppliers | **Flagged**, not inserted | `flags.orphaned_supplier_id` |
| Unparseable date / unknown category / other schema failure | **Flagged** | `flags.*` |

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
