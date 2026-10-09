# InvoiceIQ AI — Implementation Plan (Overview)

Full implementation plan for InvoiceIQ AI (intelligent invoice processing &
anomaly detection), based on `docs/IDEA.md` and the REPH AI Summit 2026
dataset provided in `dataset/` (Track 6: Invoice-to-Pay Automation).

Per-branch plans with step-by-step tasks live alongside this file:

| # | Branch | Plan doc |
|---|---|---|
| 1 | `feat/data-schema-contract` | [PLAN-01-data-schema-contract.md](./PLAN-01-data-schema-contract.md) |
| 2 | `feat/ingestion-api` | [PLAN-02-ingestion-api.md](./PLAN-02-ingestion-api.md) |
| 3 | `feat/anomaly-rules` | [PLAN-03-anomaly-rules.md](./PLAN-03-anomaly-rules.md) |
| 4 | `feat/anomaly-engine-ml` | [PLAN-04-anomaly-engine-ml.md](./PLAN-04-anomaly-engine-ml.md) |
| 5 | `feat/ai-explanations` | [PLAN-05-ai-explanations.md](./PLAN-05-ai-explanations.md) |
| 6 | `feat/dashboard-overview` | [PLAN-06-dashboard-overview.md](./PLAN-06-dashboard-overview.md) |
| 7 | `feat/dashboard-investigation` | [PLAN-07-dashboard-investigation.md](./PLAN-07-dashboard-investigation.md) |
| 8 | `feat/dashboard-workflow` | [PLAN-08-dashboard-workflow.md](./PLAN-08-dashboard-workflow.md) |
| 9 | `feat/dashboard-automation` | [PLAN-09-dashboard-automation.md](./PLAN-09-dashboard-automation.md) |
| 10 | `feat/dashboard-simulator` | [PLAN-10-dashboard-simulator.md](./PLAN-10-dashboard-simulator.md) |
| 11 | `infra/aws-terraform` | [PLAN-11-infra-terraform.md](./PLAN-11-infra-terraform.md) |

## Dataset (REPH AI Summit 2026 — Track 6: Invoice-to-Pay Automation)

Provided in `dataset/`, 100% synthetic. We use the **G_finance** domain plus
the dirty **raw/invoices_raw.csv** / **raw/suppliers_raw.csv** tables:

| Table | Key columns | Notes |
|---|---|---|
| `invoices` | invoice_id (PK), supplier_id (FK), po_id (FK, ~6% null), currency, invoice_date, net/tax/gross_amount, amount_usd, received_at, due_date, approval_level (L1/L2/L3 by USD threshold), channel (EDI/Email/Supplier portal), ocr_confidence (emailed only), processor_employee_id, status (Approved / On hold - exception / Paid) | Core fact table |
| `invoice_lines` | invoice_line_id (PK), invoice_id (FK), line_no, description, quantity, unit_price, line_amount, gl_account, cost_center_id (FK) | For total reconciliation checks |
| `invoice_exceptions` | exception_id (PK), invoice_id (FK), exception_type (Duplicate suspected, Missing PO, Price/Quantity mismatch, Tax error, Bank details changed, Missing goods receipt), raised_at, resolved_at (~5.4% null = still open), resolver_employee_id, resolution | Ground-truth exceptions already flagged upstream — useful both as detector validation signal and as a source table itself |
| `payments` | payment_id (PK), invoice_id (FK), paid_at, amount, currency, method, payment_run_id, days_vs_due (-26..26) | Payment timing |
| `purchase_orders` | po_id (PK), supplier_id, cost_center_id, requester/approver_employee_id, po_date, currency, po_amount, status | PO matching |
| `suppliers` | supplier_id (PK), entity_id (FK->business_entities), supplier_name, category, country, payment_terms_days, risk_tier (High/Med/Low), preferred, onboarded_date, status | Vendor baselines & risk tier |
| `supplier_enrollment_requests` | onboarding checks (tax/bank/sanctions screen ok), turnaround_days, status | Supplier risk context |
| `cost_centers` | cost_center_id, department_id, division_id, site_id | Department/division rollups |
| `opex_budget_vs_actual` | cost_center_id, division_id, month, budget/actual/variance_php | Optional budget-impact context |
| `raw/invoices_raw.csv`, `raw/suppliers_raw.csv` | Same shape as curated, **with injected dirty data**: blanked fields, mixed date formats, near-duplicate rows (same PK, whitespace variants), typos, late `_ingested_at`, ~1% orphaned `supplier_id` | Used to build & demo the **ingestion/validation** stage (Stage 1 in IDEA.md) |

**Baseline metrics to beat** (from `dataset/_docs/05_hackathon_package.md`, Track 6):
invoice exception rate **19.5%**, invoices without PO **6.1%**. These become
the headline KPIs on the Executive Overview page and the benchmark the
Automation Opportunities / Impact Simulator pages reference.

Published hackathon rules: use this data as the primary dataset, disclose any
transformations/models/APIs, keep a human in the loop for risk decisions
(exceptions must stay recommendations, not auto-actions), and do not rank
individual employees (so `processor_employee_id` / `resolver_employee_id`
are used only for aggregate workload stats, never individual scoring).

## Problem & Approach

Build "InvoiceIQ AI", an intelligent invoice processing & anomaly detection
platform, per `docs/IDEA.md`, on top of the dataset above. Stack:

- **Frontend:** Next.js (App Router) + Tailwind CSS + Recharts
- **Backend/API:** Next.js API routes/server actions + a small **Python
  (FastAPI) anomaly-detection microservice** running Isolation Forest
- **Database:** AWS RDS (PostgreSQL)
- **AI:** AWS Bedrock (LLM explanations/recommendations)
- **Deployment:** AWS EC2/ECS (containers), Terraform for IaC
- **Repo layout:** Monorepo — Next.js app (existing root), `services/anomaly-engine`
  (Python/FastAPI), `infra/` (Terraform)

The 5 conceptual stages from IDEA.md (Analyze → Detect → Assess/Prioritize →
Explain/Recommend → Optimize) map to the 5 dashboard pages (Executive
Overview, Anomaly Investigation, Workflow Intelligence, Automation
Opportunities, Impact Simulator).

Branching is organized **by feature/page area**, not by person, so any of the
3 collaborators can pick up ready work. A shared contract (DB schema + API
response shapes) is agreed/implemented first so pages, detection, and AI work
can proceed in parallel against mocked data before integration.

## Branch Strategy

```
main
 ├─ feat/data-schema-contract      (foundation: DB schema, Zod/TS types, mock fixtures)
 ├─ feat/ingestion-api             (dataset upload/validate, invoices + metrics API)
 ├─ feat/anomaly-rules             (business-rule detectors: duplicates, totals, overdue, missing fields)
 ├─ feat/anomaly-engine-ml         (Python FastAPI service: Isolation Forest, called from Next.js)
 ├─ feat/ai-explanations           (Bedrock integration: evidence -> explanation/recommendation)
 ├─ feat/dashboard-overview        (Page 1: Executive Overview)
 ├─ feat/dashboard-investigation   (Page 2: Anomaly Investigation table + detail panel)
 ├─ feat/dashboard-workflow        (Page 3: Workflow Intelligence)
 ├─ feat/dashboard-automation      (Page 4: Automation Opportunities)
 ├─ feat/dashboard-simulator       (Page 5: Impact Simulator)
 └─ infra/aws-terraform            (RDS, ECS/EC2, ECR, networking, Bedrock IAM)
```

Rules:
- `feat/data-schema-contract` merges to `main` first; every other branch
  branches off `main` after that lands.
- Dashboard page branches depend on `feat/ingestion-api` for real data but can
  start immediately against mock JSON fixtures defined in the schema branch.
- `feat/anomaly-engine-ml` and `feat/ai-explanations` depend on
  `feat/anomaly-rules` output shape, not its implementation — so they can
  proceed in parallel once the contract is set.
- `infra/aws-terraform` is independent and can start immediately.
- Small, short-lived branches; PR + review before merge to `main`; keep `main`
  always deployable.

## Repository Structure (target)

```
clov3r/
├─ app/                        # Next.js App Router pages (dashboard pages 1-5)
├─ lib/
│  ├─ db/                      # Drizzle/Prisma schema + client for RDS Postgres
│  ├─ detectors/               # Business-rule detectors (TS)
│  ├─ metrics/                 # Operational metric calculations
│  └─ bedrock/                 # AWS Bedrock client + prompt templates
├─ app/api/                    # Next.js route handlers (ingest, invoices, anomalies, explain, simulate)
├─ services/anomaly-engine/    # Python FastAPI: Isolation Forest scoring service
│  ├─ main.py
│  ├─ model.py
│  └─ Dockerfile
├─ infra/                      # Terraform: RDS, ECS/EC2, ECR, VPC, IAM, Bedrock access
├─ docs/
│  ├─ IDEA.md
│  └─ (this plan set)
└─ ...
```

## Data Flow (contract)

1. One-time/batch load script (`scripts/load-dataset`) imports the curated
   `dataset/G_finance/*.csv` tables as-is into RDS Postgres (`invoices`,
   `invoice_lines`, `invoice_exceptions`, `payments`, `purchase_orders`,
   `suppliers`, `supplier_enrollment_requests`, `cost_centers`,
   `opex_budget_vs_actual`), preserving the dataset's own IDs/FKs.
2. A separate ingestion path takes `dataset/raw/invoices_raw.csv` (and
   `suppliers_raw.csv`) through the **validation/cleaning** stage (Stage 1):
   normalize mixed date formats, trim/case-fix names, dedupe near-duplicate
   rows (same PK + whitespace variant), flag orphaned `supplier_id`, report
   what was fixed vs. what's left — this demonstrates the "dataset
   ingestion" deliverable using genuinely dirty data rather than a synthetic
   stand-in.
3. `feat/anomaly-rules` + `feat/anomaly-engine-ml` write to a new `anomalies`
   table with: `invoice_id, method ('rule'|'statistical'|'isolation_forest'),
   category, priority, evidence (jsonb), score`. Rule detectors should also
   cross-check against the existing `invoice_exceptions` table (dataset's own
   ground truth) both as a detector input and as a validation signal for our
   own detectors (§9 of IDEA.md: compare flagged vs. known exceptions).
4. `feat/ai-explanations` reads an `anomalies` row's evidence, calls Bedrock,
   writes `explanation, recommendation, preventive_measure` back (or to a
   related `anomaly_explanations` table) — never invents the anomaly itself.
5. Dashboard pages read via Next.js API routes (`/api/invoices`,
   `/api/anomalies`, `/api/metrics`, `/api/workflow-insights`,
   `/api/automation-opportunities`, `/api/simulate`), with KPIs benchmarked
   against the dataset's published baselines (19.5% exception rate, 6.1%
   invoices without PO).

## Notes / Considerations

- Keep AI responsibility narrow: Bedrock explains verified evidence; it must
  not invent anomaly scores or claim fraud without evidence (per IDEA.md §4/§9).
- Statistical/rule-based detectors should be testable independently — the
  dataset's own `invoice_exceptions` table gives us a real (not synthetic)
  signal to validate precision/recall against, plus hand-built fixtures for
  edge cases.
- Impact Simulator values must be clearly labeled as projections/assumptions,
  benchmarked against the dataset's published baselines.
- Dataset is large (116 tables, millions of rows across all domains); scope
  strictly to `G_finance` + the 2 relevant `raw/` tables for v1. Row counts
  per finance table should be sampled before deciding on full load vs.
  subset for local/dev Postgres.
- Per hackathon rules: disclose all transformations/models/APIs, keep humans
  in the loop for risk decisions, and never rank individual employees —
  `processor_employee_id`/`resolver_employee_id` are aggregate-only.
- Terraform state/backend, AWS account/region, and Bedrock model choice are
  not yet decided — flagged as early infra todo discussion.
- End-to-end integration: once all branches above land on `main`, do a final
  integration pass (wire env/config across app + anomaly-engine, verify data
  flow end-to-end, prepare the demo script).
