# Branch Plan: `feat/dashboard-automation`

**Depends on:** `feat/data-schema-contract` (types); benefits from
`feat/dashboard-workflow`'s aggregate insights but can be built independently
against mock data

## Goal

Build Page 4 — Automation Opportunities (IDEA.md §6, Page 4): rank potential
process improvements with measurable success criteria.

## Scope

1. Route: `app/(dashboard)/automation/page.tsx`.
2. New aggregate API: `GET /api/automation-opportunities`, deriving ranked
   candidates from the same underlying data as Page 3, scored by:
   - **Frequency** — count of recurring issue (e.g. "Missing PO" exceptions
     for a given supplier/department).
   - **Associated effort** — total review time (`resolved_at - raised_at`
     summed) tied to that issue.
   - **Potential impact** — flagged value or volume affected.
   - **Feasibility** — simple heuristic/manual tag (e.g. rule-based issues
     like missing fields are "high feasibility"; ML-flagged multivariate
     anomalies are "lower feasibility" without more data).
   - **Confidence** — based on sample size (number of historical instances).
3. Each recommendation card includes a concrete, measurable success
   criterion (e.g. "Automated PO-match validation at submission could
   reduce Missing PO exceptions by an estimated X%, based on Y historical
   occurrences").
4. Table/card UI, sortable by the ranking score.

## Definition of Done

- At least 3-5 concrete, data-backed automation recommendations are
  generated from real `invoice_exceptions`/`invoices` aggregates (not
  hardcoded copy).
- Every recommendation cites the historical frequency/effort numbers it's
  based on, directly in the UI (traceable to source data, per IDEA.md's
  evidence-based framing).

## Notes

- Keep the scoring formula simple and documented (a weighted sum is fine) —
  judges may ask how the ranking was derived; this must be explainable, not
  a black box.
