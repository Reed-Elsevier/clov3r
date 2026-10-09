# Branch Plan: `feat/dashboard-overview`

**Depends on:** `feat/data-schema-contract` (types); can build against mock
JSON matching the contract before `feat/ingestion-api`/`feat/anomaly-rules`
land, then swap to live `/api/metrics` + `/api/anomalies`

## Goal

Build Page 1 — Executive Overview (IDEA.md §6, Page 1): the finance
manager's landing page.

## Scope

1. Route: `app/(dashboard)/overview/page.tsx` (or `app/page.tsx` if this is
   the default landing page — confirm with team).
2. KPI cards (Tailwind), sourced from `/api/metrics`:
   - Total invoices analyzed
   - Anomalies detected
   - High-priority exceptions
   - Invoice exception rate (vs. published baseline **19.5%**)
   - Invoices without PO (vs. published baseline **6.1%**)
   - Estimated value of flagged invoices — **label explicitly** as "flagged
     value," not "confirmed loss/savings" (IDEA.md explicit caution).
3. Recharts visualizations:
   - Invoice anomalies over time (line/area chart, by `invoice_date` month)
   - Anomaly distribution by category (bar/pie)
   - Flagged invoice value by department (bar, via `cost_centers.department_id`)
   - Normal vs. anomalous invoice amount distribution (histogram or box plot)
4. Shared layout/nav shell (`app/(dashboard)/layout.tsx`) used by all 5
   dashboard pages — coordinate naming with the other dashboard branches
   early to avoid merge conflicts on this file.
5. Tailwind design tokens/theme (if not already decided) — propose a simple
   finance-ops palette (neutral background, amber/red for exception
   severity) and keep it consistent across all dashboard branches.

## Definition of Done

- Page renders with live data once `/api/metrics` exists; falls back
  gracefully to loading/empty states before that.
- KPI wording reviewed against IDEA.md's "be careful with wording" guidance
  (no KPI implies confirmed fraud or guaranteed savings).
- Charts responsive down to typical laptop widths; no hardcoded pixel
  dimensions that break on resize.

## Notes

- Coordinate with `feat/dashboard-investigation` et al. on the shared nav
  shell (`layout.tsx`) — ideally whoever lands first adds the shell with
  placeholder links for all 5 pages so the others just fill in their route.
