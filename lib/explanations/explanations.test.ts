import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildExplainPrompt, parseExplanationOutput } from "../bedrock/prompts/explain-anomaly";
import { mockAnomalies, mockAnomalyExplanations } from "../fixtures";
import { mockOutput, verifyOutput } from "./generate";
import { extractClaims, verifyNumbers } from "./verify";

const highAmount = mockAnomalies.find((a) => a.category === "Unusually high amount")!;
const duplicate = mockAnomalies.find((a) => a.category === "Duplicate invoice")!;

describe("extractClaims", () => {
  it("reads amounts, decimals, percents and suffixes but skips identifiers", () => {
    const { claims, dates } = extractClaims(
      "INV9000002 (MCP-2608-001) is USD 120,960 vs $28,560, z-score 4.2, 15% over, ~120k, L3 approval, due 2026-08-25.",
    );
    assert.deepEqual(
      claims.map((c) => c.value),
      [120960, 28560, 4.2, 15, 120000],
    );
    assert.deepEqual(dates, ["2026-08-25"]);
  });

  it("handles negative scores", () => {
    assert.equal(extractClaims("score -0.087").claims[0].value, -0.087);
  });
});

describe("verifyNumbers", () => {
  it("accepts the hand-written fixture explanations", () => {
    for (const e of mockAnomalyExplanations) {
      const anomaly = mockAnomalies.find((a) => a.anomaly_id === e.anomaly_id)!;
      const texts = [e.explanation, e.evidence_summary, e.potential_impact, e.preventive_measure, ...e.recommended_actions];
      assert.deepEqual(verifyNumbers(texts, anomaly.evidence, anomaly.score === null ? [] : [anomaly.score]), { ok: true, unsupported: [] });
    }
  });

  it("accepts rounding to the precision shown", () => {
    assert.equal(verifyNumbers(["about USD 121,000 (z 4)"], { amountUsd: 120960, zScore: 4.2 }).ok, false);
    assert.equal(verifyNumbers(["about USD 121k, z-score 4.2"], { amountUsd: 120960, zScore: 4.2 }).ok, true);
    assert.equal(verifyNumbers(["5% supplier exception rate"], { features: { supplierExceptionRate: 0.05 } }).ok, true);
  });

  it("flags invented figures and dates", () => {
    const r = verifyNumbers(
      ["The supplier was overpaid by USD 45,000 on 2026-09-01, a 37% increase."],
      highAmount.evidence,
    );
    assert.equal(r.ok, false);
    assert.deepEqual(r.unsupported.sort(), ["2026-09-01", "37%", "45,000"].sort());
  });

  it("ignores small counts and list numbering", () => {
    assert.equal(verifyNumbers(["1. Check 3 records within 2 days"], {}).ok, true);
  });
});

describe("explain-anomaly prompt", () => {
  it("sends only category, method, score and evidence", () => {
    const { system, user } = buildExplainPrompt(highAmount);
    const facts = JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1));
    assert.deepEqual(Object.keys(facts).sort(), ["category", "detectionMethod", "evidence", "score"]);
    assert.equal(facts.score, 4.2);
    assert.match(system, /Never claim or imply fraud/);
    assert.doesNotMatch(user, /INV9000005|Mock Cloud Software/);
  });

  it("includes retry feedback when given", () => {
    assert.match(buildExplainPrompt(highAmount, "it mentioned 37%").user, /previous answer was rejected: it mentioned 37%/);
  });
});

describe("parseExplanationOutput", () => {
  const valid = {
    explanation: "x",
    evidenceSummary: "y",
    potentialImpact: "z",
    recommendedActions: ["a"],
    preventiveMeasure: "p",
    requiresHumanReview: true,
  };

  it("extracts JSON from fenced or chatty replies", () => {
    const r = parseExplanationOutput(`Sure!\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
    assert.equal(r.success, true);
  });

  it("rejects missing keys and non-JSON", () => {
    assert.equal(parseExplanationOutput(JSON.stringify({ ...valid, recommendedActions: [] })).success, false);
    assert.equal(parseExplanationOutput("I cannot help with that").success, false);
  });
});

describe("offline template", () => {
  it("passes the numeric cross-check for every fixture anomaly", () => {
    for (const a of mockAnomalies) assert.equal(verifyOutput(mockOutput(a), a).ok, true, a.category);
  });

  it("restates the evidence summary", () => {
    assert.match(mockOutput(duplicate).evidenceSummary, /MCP|INV9000001/);
  });
});
