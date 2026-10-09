# Branch Plan: `feat/dashboard-simulator`

**Depends on:** `feat/data-schema-contract` (types); reads aggregate metrics
from `feat/ingestion-api`'s `/api/metrics` as its baseline

## Goal

Build Page 5 — Impact Simulator (IDEA.md §6, Page 5): let managers explore
hypothetical "what if" scenarios against the real baseline metrics.

## Scope

1. Route: `app/(dashboard)/simulator/page.tsx`.
2. New API: `GET /api/simulate?automatedValidationPct=30&processingTimeReductionPct=20&manualReviewReductionPct=...`
   (or a `POST` with a body) — computes **projected** values by applying the
   requested percentage reductions to the live baseline numbers from
   `/api/metrics` (e.g. current missing-PO exception count, current average
   processing time, current manual-review volume).
3. UI: sliders/inputs for each assumption (e.g. "What if automated
   validation prevents X% of missing-field errors?", "What if processing
   time decreases by Y%?"), with before/after comparison cards and a
   Recharts bar/line showing baseline vs. projected.
4. **Every projected number is visibly labeled** "Projected / Assumption" —
   never presented as an actual measured result (IDEA.md's explicit
   requirement).

## Definition of Done

- Moving a slider updates the projection in real time (client-side math is
  fine once the baseline is fetched — no need to round-trip the API on every
  slider tick).
- Baseline values are pulled live from `/api/metrics`, not hardcoded.
- UI clearly visually distinguishes "current/actual" from "projected"
  figures (e.g. different color, explicit badge/label).

## Notes

- This page is the lowest-risk to build against mock data first, since it's
  purely derived math on top of baseline metrics — good candidate to start
  early while waiting on live `/api/metrics`.
