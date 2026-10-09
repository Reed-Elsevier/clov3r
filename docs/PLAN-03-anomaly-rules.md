# Branch Plan: `feat/anomaly-rules`

**Depends on:** `feat/data-schema-contract` (schema), reads data populated by
`feat/ingestion-api` (can develop against a small local fixture in the
meantime)
**Blocks:** `feat/anomaly-engine-ml`, `feat/ai-explanations` (they consume the
`anomalies` row shape this branch finalizes)

## Goal

Implement deterministic, explainable business-rule detectors — the "easy to
explain and test" layer from IDEA.md §4 — and validate them against the
dataset's own ground-truth `invoice_exceptions` table.

## Scope

Detectors in `lib/detectors/`, each a pure function `(invoice, relatedRows) => Anomaly | null`:

1. **Duplicate invoice** — same `supplier_id` + same/near-identical
   `invoice_number`/amount within a short date window.
2. **Missing PO** — `invoices.po_id IS NULL` (baseline: 6.1% of invoices).
3. **Price/quantity mismatch** — `invoice_lines` line amounts don't
   reconcile against `purchase_orders.po_amount` for the linked PO.
4. **Tax/total error** — `net_amount + tax_amount != gross_amount` beyond a
   rounding tolerance.
5. **Overdue invoice** — `status != 'Paid'` and `due_date < today`, or paid
   late per `payments.days_vs_due > 0`.
6. **Unusual vendor transaction** (flag only, hand off numeric scoring to
   the ML branch) — simple threshold: amount > 3x supplier's historical
   average `amount_usd`.

Each detector writes to `anomalies` with `method = 'rule'`, a `category`
string, `priority` derived from amount/urgency, and `evidence` jsonb
containing the specific numbers that triggered the rule (never a vague
claim).

## Validation harness

- Compare each rule's hits against the dataset's own `invoice_exceptions`
  table (`exception_type` values: Bank details changed, Duplicate suspected,
  Missing PO, Missing goods receipt, Price mismatch, Quantity mismatch, Tax
  error) — report precision/recall per rule. This is real validation data,
  not synthetic, and should be highlighted in the demo.
- Unit tests with hand-built fixtures for each rule's edge cases
  (rounding tolerance, exact boundary dates, etc).

## Definition of Done

- All 6 detectors implemented, unit-tested, and documented with the exact
  evidence fields they populate.
- A short validation report (markdown or console output) comparing rule
  hits vs. `invoice_exceptions` ground truth.
- `anomalies` rows produced are consumable by the dashboard branches without
  changes to the schema contract.

## Notes

- Per hackathon rules: these are recommendations for human review, not
  automatic rejections — `status` always starts at `'Needs review'`.
- Keep thresholds configurable (e.g. a constants file) so they can be tuned
  without code changes once real distributions are seen.

## Implementation

Implemented with PLAN-04 on `feat/anomaly-rules-ml`, based on `origin/main`
after the shared schema contract merged. Pure detectors and exact evidence
fields are documented in [lib/detectors/README.md](../lib/detectors/README.md).
The batch CLI supports curated CSVs, loaded PostgreSQL, synthetic fixtures,
JSON threshold overrides, label-agreement reports, and insert-only persistence
that cannot reset human review outcomes.

See [ANOMALY_VALIDATION.md](./ANOMALY_VALIDATION.md) for verified fixture results
and the real-data/database validation gates blocked by unavailable inputs.
