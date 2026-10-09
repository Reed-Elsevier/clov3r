# Branch Plan: `feat/dashboard-investigation`

**Depends on:** `feat/data-schema-contract` (types); live data from
`feat/anomaly-rules`/`feat/anomaly-engine-ml`; explanations from
`feat/ai-explanations` (detail panel) — can stub all three with mock JSON
first

## Goal

Build Page 2 — Anomaly Investigation (IDEA.md §6, Page 2): a searchable
table of detected anomalies with a drill-down detail panel.

## Scope

1. Route: `app/(dashboard)/investigation/page.tsx`.
2. Table (`/api/anomalies` — paginated, filterable by category, priority,
   status, supplier, date range), columns: Invoice, Anomaly (category),
   Priority, Evidence (short summary), Status.
3. Row click → detail panel/drawer showing:
   - Full evidence (from `anomalies.evidence` jsonb) rendered as a readable
     list, not raw JSON.
   - AI-generated explanation/recommendation (from `anomaly_explanations`,
     via `/api/anomalies/[id]` which joins both tables) — if not yet
     generated, show a "Generate explanation" action calling
     `feat/ai-explanations`'s route.
   - Status update control (Needs review → Investigating → Resolved/
     Dismissed) — `PATCH /api/anomalies/[id]`.
4. Search/filter UI — client-side for small result sets, server-side query
   params for larger ones.

## Definition of Done

- Table and detail panel work end-to-end against mock fixtures matching the
  `feat/data-schema-contract` Zod types.
- Evidence and AI explanation are visually distinguished (e.g. "Detected" vs
  "AI explanation" sections) so users never confuse a generated explanation
  for raw system output.
- Status transitions persist and reflect immediately in the table.

## Notes

- This page is the most schema-sensitive of the five — align early with
  `feat/anomaly-rules` and `feat/ai-explanations` on the exact `evidence`
  and explanation JSON shapes to avoid rework.
