# Branch Plan: `feat/anomaly-engine-ml`

**Depends on:** `feat/anomaly-rules` (output shape/`anomalies` table only —
can be built in parallel once that contract is set)
**Blocks:** nothing hard; dashboards benefit from richer anomalies once merged

## Goal

Add multivariate statistical detection via Isolation Forest for anomalies
that simple per-field rules miss (IDEA.md §4, technique 2).

## Scope

1. **Python FastAPI service** in `services/anomaly-engine/`:
   - `main.py` — `POST /score` endpoint: accepts a batch of invoice feature
     rows, returns anomaly scores + outlier flags.
   - `model.py` — scikit-learn `IsolationForest`, trained on:
     - `amount_usd`
     - vendor historical average `amount_usd` (precomputed per supplier)
     - processing duration (`paid_at - received_at`, or `received_at - invoice_date`)
     - `ocr_confidence` (nullable — impute or use a missing-flag feature)
     - per-supplier exception frequency (count of `invoice_exceptions` / count of invoices)
   - `Dockerfile` — slim Python image, exposes port for ECS/local use.
2. **Next.js integration** (`lib/detectors/isolation-forest-client.ts`):
   server-side fetch wrapper calling the FastAPI service via
   `ANOMALY_ENGINE_URL`, writing results to `anomalies` with
   `method = 'isolation_forest'` and the raw Isolation Forest score in
   `score`.
3. **Feature engineering notes**: document encoding choices for categorical
   fields (e.g. `channel`, `currency`) and how missing `ocr_confidence` is
   handled (it's only populated for `Email` channel invoices per the data
   dictionary) — this must be disclosed per hackathon rules.
4. A small script to batch-score all loaded invoices once, rather than
   scoring inline per request (keeps the dashboard fast).

## Definition of Done

- `services/anomaly-engine` runs locally (`uvicorn main:app`) and scores a
  sample batch of invoices with reasonable (non-crashing, bounded) scores.
- Clear separation maintained: this service **only** returns a score/flag —
  it does not generate explanations or recommendations (that's Bedrock's job
  per IDEA.md's division of responsibility).
- Injected test cases (a handful of deliberately extreme invoices) are
  correctly flagged as outliers, demonstrating detector behavior per IDEA.md
  §9.

## Notes

- If the real dataset's numeric fields turn out too clean/well-behaved for
  Isolation Forest to produce an interesting demo, inject a small number of
  clearly-synthetic "test probe" records (explicitly disclosed as such) to
  validate the detector responds correctly — do not claim these as real
  findings.
- Keep model training offline/batch (not per-request) given dataset scale.
