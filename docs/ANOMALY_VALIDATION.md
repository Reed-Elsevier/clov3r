# PLAN-03 / PLAN-04 validation status

## Verified locally

- 19 TypeScript tests cover all six deterministic rules, exact tolerance/date
  boundaries, duplicate normalization, partial PO billing, baseline leakage,
  CSV quoting/nulls, anomaly schema compatibility, label metrics, client error
  handling, and insert-preparation human-review constraints.
- 6 Python tests cover artifact round trips, deterministic training, missing
  columns, bounded scores, controlled extreme probes, API validation, and
  untrained-service 503 responses.
- TypeScript type checking and scoped ESLint pass against the merged PLAN-01
  Drizzle/Zod contract without schema changes.
- A real local uvicorn HTTP service loaded a temporary, explicitly synthetic
  200-row model. `/ready` returned 200 and the TypeScript client scored all six
  shared fixtures end to end. No database writes occurred in that smoke test.

## Synthetic rule report

Command: `npm run anomalies:batch -- --source fixture --as-of 2026-10-08`.
Input: the six hand-built PLAN-01 fixtures, **not the supplied dataset**.
The run produced eight rule findings:

| Rule | Detected invoices | Matching labeled invoices | Precision | Recall |
| --- | ---: | ---: | ---: | ---: |
| Duplicate invoice | 2 | 1 | 0.50 | 1.00 |
| Missing PO | 1 | 1 | 1.00 | 1.00 |
| Price/quantity mismatch | 0 | 0 | N/A | N/A |
| Tax/total error | 1 | 0 | 0.00 | N/A |
| Overdue invoice | 4 | No corresponding labels | N/A | N/A |
| Unusual vendor transaction | 0 | No corresponding labels | N/A | N/A |

Both invoices in the duplicate pair are flagged, but the fixture labels only
one. The fixture's tax inconsistency has no upstream label. These examples
demonstrate why upstream-label agreement is not confirmed real-world precision
or fraud accuracy. Findings always require human verification.

The controlled ML test uses a seeded concentrated synthetic reference and an
injected amount/delay/confidence/exception-rate probe, not real invoice findings.
At unchanged test settings (100 trees, contamination 0.05), the probe scored
approximately -0.668 against threshold -0.557 and was flagged. A uniformly
distributed synthetic reference did **not** flag the same probe at its own
threshold; that limitation is disclosed, not hidden by changing contamination.

## Not yet verified

`dataset/G_finance` is absent in this checkout. Real-data validation cannot be
reported or fabricated. Run the CSV command once the provided dataset exists:

```powershell
npm run anomalies:batch -- --source csv --dataset dataset/G_finance --as-of 2026-10-08 --report-out reports/anomalies/real-rules.json
```

The JSON report includes per-rule precision/recall, unmatched alerts, missed
labels, unsupported exception types, and model-feature skips. Use a meaningful
as-of date for the dataset. Report results as agreement with upstream labels,
not independently verified detection accuracy. Overdue/vendor rules remain
unlabeled under the supplied exception taxonomy.

No live PostgreSQL database was configured or written in this session. After
PLAN-01 migrations and PLAN-02 loading, validate `--source db --persist`, rerun
to verify unique-key idempotency, and confirm existing human review states and
explanations are unchanged. Training on real data, Docker build/runtime, and
deployed ECS readiness also remain integration gates; no production model or
real financial performance claim is supplied by this branch.