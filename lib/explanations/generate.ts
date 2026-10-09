import { bedrockModelId, converse } from "@/lib/bedrock/client";
import {
  buildExplainPrompt,
  parseExplanationOutput,
  promptFacts,
  type ExplainInput,
  type ExplanationOutput,
} from "@/lib/bedrock/prompts/explain-anomaly";
import type { Anomaly, AnomalyExplanation } from "@/lib/schemas";

import { verifyNumbers } from "./verify";

/** The model's reply kept citing figures absent from the evidence, or never returned valid JSON. */
export class ExplanationRejectedError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Generated explanation rejected: ${reasons.join(" | ")}`);
  }
}

const MAX_ATTEMPTS = 2;
export const MOCK_MODEL_ID = "mock-explainer (BEDROCK_MODEL_ID not set)";

export function verifyOutput(output: ExplanationOutput, input: ExplainInput) {
  const texts = [
    output.explanation,
    output.evidenceSummary,
    output.potentialImpact,
    output.preventiveMeasure,
    ...output.recommendedActions,
  ];
  return verifyNumbers(texts, promptFacts(input).evidence, input.score === null ? [] : [input.score]);
}

function toRow(anomalyId: string, output: ExplanationOutput, modelId: string): AnomalyExplanation {
  return {
    anomaly_id: anomalyId,
    explanation: output.explanation,
    evidence_summary: output.evidenceSummary,
    potential_impact: output.potentialImpact,
    recommended_actions: output.recommendedActions,
    preventive_measure: output.preventiveMeasure,
    // Every invoice anomaly touches a payment decision, so review is always required.
    requires_human_review: true,
    model_id: modelId,
    generated_at: new Date().toISOString(),
  };
}

/** Offline fallback so the UI works without AWS; restates only the evidence summary. */
export function mockOutput(input: ExplainInput): ExplanationOutput {
  const summary = typeof input.evidence.summary === "string" ? input.evidence.summary : input.category;
  return {
    explanation: `This invoice was flagged as "${input.category}". ${summary}.`,
    evidenceSummary: summary,
    potentialImpact: "The invoice may need additional verification before approval or payment. This is not evidence of fraud.",
    recommendedActions: [
      "Compare the invoice against the purchase order and goods receipt.",
      "Confirm the details with the supplier's records.",
      "Record the review outcome and update the status.",
    ],
    preventiveMeasure: `Add an automated "${input.category}" check at invoice intake.`,
    requiresHumanReview: true,
  };
}

export interface GenerateDeps {
  modelId: string | null;
  converse: (prompt: { system: string; user: string }) => Promise<string>;
}

const defaultDeps = (): GenerateDeps => ({ modelId: bedrockModelId(), converse });

/**
 * Generates a structured explanation for one anomaly (PLAN-05). Uses Bedrock
 * when `BEDROCK_MODEL_ID` is set, otherwise a labelled offline template. Model
 * output is schema-validated and numerically cross-checked against the
 * evidence; one retry with feedback is allowed before rejecting.
 */
export async function generateExplanation(
  anomaly: Pick<Anomaly, "anomaly_id"> & ExplainInput,
  deps: GenerateDeps = defaultDeps(),
): Promise<AnomalyExplanation> {
  const input: ExplainInput = {
    category: anomaly.category,
    method: anomaly.method,
    score: anomaly.score,
    evidence: anomaly.evidence,
  };

  const { modelId } = deps;
  if (!modelId) return toRow(anomaly.anomaly_id, mockOutput(input), MOCK_MODEL_ID);

  const reasons: string[] = [];
  let feedback: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const parsed = parseExplanationOutput(await deps.converse(buildExplainPrompt(input, feedback)));
    if (!parsed.success) {
      feedback = `it did not match the required JSON format (${parsed.error})`;
      reasons.push(feedback);
      continue;
    }
    const check = verifyOutput(parsed.data, input);
    if (check.ok) return toRow(anomaly.anomaly_id, parsed.data, modelId);
    feedback = `it mentioned figures that are not in the facts: ${check.unsupported.join(", ")}`;
    reasons.push(feedback);
  }
  throw new ExplanationRejectedError(reasons);
}
