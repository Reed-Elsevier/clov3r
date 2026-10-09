# Batch Isolation Forest scoring (PLAN-04)

This service returns numeric scores and outlier flags only. It does not explain
findings, invent priorities, or make payment/risk decisions. The server-only
TypeScript client maps flagged rows to the existing `NewAnomaly` contract with
`method = isolation_forest`, `category = Multivariate outlier`, and human-review
status. Bedrock remains responsible for evidence-grounded explanations.

## Disclosed features and preprocessing

`engineerFeatures` derives these fields from the curated/loaded finance rows:

| Feature | Definition |
| --- | --- |
| `amount_usd` | Invoice gross value in the dataset's USD conversion; currencies are never compared directly |
| `vendor_avg_usd` | Supplier mean from strictly earlier invoice dates, excluding self/same-day/future rows; null for cold start |
| `processing_days` | Consistent receipt latency: `received_at - invoice_date`, in fractional UTC days. This is **not** approval processing time; paid-at duration is deliberately not mixed into the same feature |
| `ocr_confidence` | 0..1 confidence for Email invoices; null for other channels |
| `supplier_exception_rate` | Fraction of prior supplier invoices with an exception already raised before the current invoice date; multiple exceptions count once; cold start is zero |

The fitted matrix adds `ocr_missing` and `vendor_baseline_missing` flags.
Missing confidence/baselines are median-imputed using **training** statistics;
an entirely missing training column uses sklearn's zero fallback with the
missing flag retained. No numeric scaling is needed for tree-based splits.
Missing flags keep feature dimensions stable at serving time. Negative receipt
latencies/amounts or invalid confidence are reported as skipped model rows,
not silently clamped. Original business-rule analysis still runs for them.

Supplier baselines and exception availability use prior-date information;
the current invoice's exception label is not fed into its own model features.
Channel is represented only by OCR availability; currency is normalized via
USD. Vendor/country/employee IDs are not ordinal-encoded or ranked. Calendar
timestamps without offsets are interpreted as UTC. These choices must be
disclosed during the hackathon demonstration.

Training uses `SimpleImputer` + scikit-learn `IsolationForest`, default 200
trees, contamination 0.02, random seed 42, and one worker. Contamination is a
threshold assumption, not a measured invoice fraud rate. At least 20 unique
representative invoices are required. A deterministic hash identifies the
training features/configuration under the pinned dependency versions.

Raw `score_samples` values (normally -1..0) are returned and stored directly;
lower means more unusual. `threshold` is the trained forest's `offset_`, and
`is_outlier` is exactly `score < threshold`. It is not a probability or confidence
of fraud. Tree splits do not extrapolate extremeness beyond learned boundaries;
an extreme numeric value is not guaranteed to be flagged on every distribution.

## Train once, serve many requests

Install Python 3.12, and use an isolated environment. `uv` is optional; ordinary
`python -m venv` plus `pip install` also works. From the repository root:

```powershell
uv venv services/anomaly-engine/.venv --python 3.12
uv pip install --python services/anomaly-engine/.venv/Scripts/python.exe -r services/anomaly-engine/requirements-dev.txt
npm run anomalies:batch -- --source csv --dataset dataset/G_finance --as-of 2026-10-08 --features-out reports/anomalies/features.json
services/anomaly-engine/.venv/Scripts/python.exe services/anomaly-engine/train.py --input reports/anomalies/features.json --output services/anomaly-engine/artifacts/isolation-forest.joblib
$env:MODEL_PATH = (Resolve-Path services/anomaly-engine/artifacts/isolation-forest.joblib).Path
services/anomaly-engine/.venv/Scripts/python.exe -m uvicorn main:app --app-dir services/anomaly-engine --host 127.0.0.1 --port 8000
```

Feature export also supports `--source db`. `train.py` accepts `--contamination`,
`--trees`, and `--seed`. Select a representative reference distribution and
evaluate held-out/time-sliced records before drawing real-world conclusions;
the batch command does not automatically select or certify a reference set.

In another terminal, configure `.env.local`'s `ANOMALY_ENGINE_URL` or set it:

```powershell
$env:ANOMALY_ENGINE_URL = 'http://127.0.0.1:8000'
npm run anomalies:batch -- --source csv --as-of 2026-10-08 --score --report-out reports/anomalies/scored.json
npm run anomalies:batch -- --source db --as-of 2026-10-08 --score --persist
```

The shared fixture has only six invoices and cannot train a representative
model. Tests use an explicitly synthetic 200-row seeded reference and extreme
probes; those are never dataset findings. Features and trained artifacts are
Git-ignored and should be protected as potentially sensitive financial data.
Only load trusted joblib artifacts; unpickling untrusted models executes code.

The model loads once during startup. Changing the artifact requires a service
restart/rollout; `/score` never fits or re-trains a model. If no artifact exists,
`/health` is 200 but `/ready` and `/score` are 503. Invalid artifacts fail startup.

## API contract

`POST /score` accepts `{ "features": [...] }`, with 1..1000 unique invoice IDs
and the five fields in the feature table. Inputs reject negative/nonfinite
numbers, confidence/rates outside [0,1], unknown fields, and duplicate IDs.

Response:

```json
{
  "model_version": "iforest-v1-<training-hash>",
  "threshold": -0.55,
  "training_row_count": 200,
  "results": [
    { "invoice_id": "SYNTHETIC-PROBE", "score": -0.67, "is_outlier": true }
  ]
}
```

These example numbers are illustrative. Open `/docs` for the generated API
schema. The client sends sequential chunks of <=1000 with a 30-second timeout,
validates every response/ID/flag, and refuses a model-version change mid-batch.
The batch command collects all scores before beginning database writes, so a
failed remote chunk does not leave partially persisted results.

Stored evidence fields are `summary`, `threshold`, `modelVersion`,
`trainingRowCount`, and `features` with `amountUsd`, `vendorAvgUsd`,
`processingDays`, `ocrConfidence`, `supplierExceptionRate`. Priorities follow
the shared USD amount thresholds; no ML score is treated as financial loss.

## Containers and checks

Train a model first, then build `docker build --platform linux/amd64 -t
invoiceiq-anomaly-engine services/anomaly-engine`. The image includes local
`artifacts/` if present, excludes virtualenv/tests/JSON feature inputs, runs as
an unprivileged user, and listens on 8000. Alternatively mount a trusted model
read-only and set `MODEL_PATH`. Configure ECS to use `/ready` for its health
check so a missing model cannot appear deployment-ready. Keep this unauthenticated
internal API behind the infra security group, never a public listener.

```powershell
services/anomaly-engine/.venv/Scripts/python.exe -B -m unittest discover -s services/anomaly-engine/tests -v
npm run test:detectors
npm run typecheck
npm run lint
```

Real PostgreSQL persistence and real-dataset metrics require the supplied data
and loaded schema; see [validation status](../../docs/ANOMALY_VALIDATION.md).