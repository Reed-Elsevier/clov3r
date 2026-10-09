# Branch Plan: `feat/ai-explanations`

**Depends on:** `feat/anomaly-rules` (output shape only)
**Blocks:** `feat/dashboard-investigation` (detail panel shows this output)

## Goal

Turn a verified anomaly + its evidence into a structured, human-readable
explanation and recommendation via AWS Bedrock — without letting the LLM
invent scores or accusations (IDEA.md §4/§5/§9).

## Scope

1. **Bedrock client** (`lib/bedrock/client.ts`) — AWS SDK v3
   `@aws-sdk/client-bedrock-runtime`, using `BEDROCK_MODEL_ID` env var.
2. **Prompt template** (`lib/bedrock/prompts/explain-anomaly.ts`) that:
   - Receives only the anomaly's `category`, `method`, `score`, and
     `evidence` (structured facts) — never raw free-form invoice dumps.
   - Instructs the model to return a structured JSON object:
     `{ explanation, evidenceSummary, potentialImpact, recommendedActions: string[], preventiveMeasure, requiresHumanReview: true }`.
   - Explicitly instructs: do not invent anomaly scores, do not claim fraud
     without evidence, always mark `requiresHumanReview: true` for anything
     touching supplier risk or payment decisions.
3. **API route** (`app/api/anomalies/[id]/explain/route.ts`): `POST` —
   triggers explanation generation for a given anomaly, writes to
   `anomaly_explanations` (idempotent — skip if already generated unless
   `?regenerate=true`).
4. **Validation**: a small test harness that checks every numerical claim in
   the generated explanation text traces back to a value present in the
   `evidence` jsonb (simple substring/number-presence check) — catches
   invented figures (IDEA.md §9).

## Definition of Done

- Given a fixture anomaly (e.g. "Unusually high invoice amount" with
  evidence `{ amountUsd, vendorAvgUsd, zScore }`), the route returns a
  structured explanation matching the schema above.
- Explanation never includes unsupported claims — verified via the numeric
  cross-check harness.
- `model_id` is stored on every `anomaly_explanations` row for disclosure.

## Notes

- Keep the Bedrock prompt and model choice easily swappable (model ID is an
  env var, not hardcoded) — final model selection is an open infra decision
  flagged in `PLAN-11-infra-terraform.md`.
- Batch/async generation (e.g. triggered after rule+ML detection completes)
  is preferable to generating on-demand per dashboard page load, to keep the
  UI fast and Bedrock costs predictable.
