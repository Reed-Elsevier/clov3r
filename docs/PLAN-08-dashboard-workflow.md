# Branch Plan: `feat/dashboard-workflow`

**Depends on:** `feat/data-schema-contract` (types); live data ideally from
`feat/ingestion-api` + `feat/anomaly-rules`

## Goal

Build Page 3 — Workflow Intelligence (IDEA.md §6, Page 3): recurring
operational issues, grouped by organizational dimensions available in the
dataset.

## Scope

1. Route: `app/(dashboard)/workflow/page.tsx`.
2. New aggregate API: `GET /api/workflow-insights`, computing:
   - Exceptions by department/cost center (`cost_centers.department_id`,
     `.division_id`, `.site_id` joined through `invoice_lines.cost_center_id`
     or `purchase_orders.cost_center_id`).
   - Exceptions by supplier (`suppliers.supplier_name`, `.category`,
     `.risk_tier`) — which suppliers generate recurring data-quality issues
     (high `invoice_exceptions` count relative to invoice volume).
   - Exceptions by `exception_type` — which categories consume the most
     review time (`resolved_at - raised_at` duration).
   - Processing delay trend — `payments.days_vs_due` distribution over time,
     and `invoice_exceptions` open vs. resolved ratio over time.
3. Visualizations (Recharts): grouped bar charts for department/supplier
   breakdowns, a duration box/violin or percentile chart for review time by
   exception type, a trend line for delays over time.

## Definition of Done

- Page answers the 5 starter questions from IDEA.md §6 Page 3 using real
  dataset joins (department, supplier, category, delay trend, automation
  candidates — automation candidates feed into `feat/dashboard-automation`,
  don't duplicate that logic here).
- All groupings use the dataset's actual FKs (`cost_center_id`,
  `supplier_id`) rather than invented categories.

## Notes

- `dataset/I_process/automation_candidates.csv` (outside G_finance) may be a
  useful cross-reference if this page's team member wants a stronger tie-in
  to existing automation signals already present in the dataset — optional,
  not required for v1.
