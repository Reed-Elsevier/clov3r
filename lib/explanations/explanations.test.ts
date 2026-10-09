import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildExplainPrompt, parseExplanationOutput, promptFacts } from "../bedrock/prompts/explain-anomaly";
import { runRules } from "../detectors/batch";
import type { RelatedRows } from "../detectors/context";
import { detectUnusualVendorTransaction } from "../detectors/rules";
import {
  mockAnomalies,
  mockAnomalyExplanations,
  mockInvoiceExceptions,
  mockInvoiceLines,
  mockInvoices,
  mockPayments,
  mockPurchaseOrders,
} from "../fixtures";
import { anomalyExplanationSchema, type Anomaly, type AnomalyExplanation } from "../schemas";
import { ExplanationRejectedError, generateExplanation, mockOutput, verifyOutput } from "./generate";
import { explainAnomaly } from "./service";
import type { ExplanationStore } from "./store";
import { extractClaims, verifyNumbers } from "./verify";

const highAmount = mockAnomalies.find((a) => a.category === "Unusually high amount")!;
const duplicate = mockAnomalies.find((a) => a.category === "Duplicate invoice")!;

const AS_OF = "2026-10-08";
const detected = runRules(
  {
    invoices: mockInvoices,
    invoiceLines: mockInvoiceLines,
    purchaseOrders: mockPurchaseOrders,
    payments: mockPayments,
    invoiceExceptions: mockInvoiceExceptions,
  },
  AS_OF,
);

const vendorContext: RelatedRows = {
  asOfDate: AS_OF,
  candidates: [],
  lines: [],
  payments: [],
  vendorAvgUsd: 28_560,
  vendorInvoiceCount: 5,
  poInvoicedTotal: null,
  isFinalPoInvoice: false,
};
const vendor = detectUnusualVendorTransaction(mockInvoices.find((i) => i.invoice_id === "INV9000005")!, vendorContext)!;

const reply = (output: Record<string, unknown>) =>
  JSON.stringify({
    explanation: "x",
    evidenceSummary: "y",
    potentialImpact: "z",
    recommendedActions: ["Verify with the supplier."],
    preventiveMeasure: "p",
    requiresHumanReview: true,
    ...output,
  });

describe("with PLAN-03 detector output", () => {
  it("detectors produced findings to explain", () => {
    assert.ok(detected.length > 0);
    assert.equal(vendor.category, "Unusual vendor transaction");
  });

  it("sends only facts the model is allowed to see for every detector finding", () => {
    for (const a of [...detected, vendor]) {
      const { user } = buildExplainPrompt(a);
      const facts = JSON.parse(user.slice(user.indexOf("{"), user.lastIndexOf("}") + 1));
      assert.deepEqual(Object.keys(facts).sort(), ["category", "detectionMethod", "evidence", "score", "scoreMeaning"]);
      assert.doesNotMatch(user, /Mock (Cloud|Content|Facilities)|EMP9/, a.category);
    }
  });

  it("offline template passes the cross-check for every detector finding", () => {
    for (const a of [...detected, vendor]) assert.equal(verifyOutput(mockOutput(a), a).ok, true, a.category);
  });

  it("grounded vendor explanation passes; an invented figure is caught", () => {
    const grounded = {
      explanation: "USD 120,960 is about 4.2 times this supplier's earlier average of USD 28,560 across 5 prior invoices, above the 3x review setting.",
      evidenceSummary: "Amount USD 120,960; supplier average USD 28,560; ratio 4.24.",
      potentialImpact: "If the amount is wrong, USD 120,960 could be paid without review.",
      recommendedActions: ["Confirm the quantity and price with the requester.", "Check the purchase order balance."],
      preventiveMeasure: "Route invoices far above a supplier's usual amount to an extra approval step.",
      requiresHumanReview: true,
    };
    assert.deepEqual(verifyOutput(grounded, vendor), { ok: true, unsupported: [] });
    const invented = { ...grounded, potentialImpact: "This could be an overpayment of USD 92,400." };
    assert.deepEqual(verifyOutput(invented, vendor).unsupported, ["92,400"]);
  });

  it("caps long evidence arrays and verifies against exactly what the model saw", () => {
    const lines = Array.from({ length: 12 }, (_, i) => ({ invoiceLineId: `L${i}`, lineAmount: 100 + i }));
    const input = { category: "Price/quantity mismatch", method: "rule" as const, score: null, evidence: { summary: "s", inconsistentLines: lines } };
    const facts = promptFacts(input);
    assert.equal((facts.evidence.inconsistentLines as unknown[]).length, 10);
    assert.equal(facts.evidence.inconsistentLinesTotalCount, 12);
    assert.equal(verifyOutput(JSON.parse(reply({ explanation: "12 lines do not reconcile." })), input).ok, true);
    assert.equal(verifyOutput(JSON.parse(reply({ explanation: "Line amount 111 differs." })), input).ok, false);
  });
});

describe("generateExplanation with a stubbed model", () => {
  const anomaly = { ...vendor, anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4eff" };

  it("retries once with feedback after an invented figure, then stores the grounded answer", async () => {
    const prompts: string[] = [];
    const replies = [
      reply({ explanation: "Overpayment of USD 92,400 is likely.", requiresHumanReview: false }),
      reply({ explanation: "USD 120,960 is about 4.2 times the supplier average.", requiresHumanReview: false }),
    ];
    const row = await generateExplanation(anomaly, {
      modelId: "test-model",
      converse: async ({ user }) => {
        prompts.push(user);
        return replies.shift()!;
      },
    });
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /previous answer was rejected: .*92,400/);
    assert.equal(row.model_id, "test-model");
    assert.equal(row.requires_human_review, true);
    assert.equal(anomalyExplanationSchema.safeParse(row).success, true);
  });

  it("rejects after two unsupported or malformed replies", async () => {
    const replies = ["not json", reply({ explanation: "A 37% increase." })];
    await assert.rejects(
      generateExplanation(anomaly, { modelId: "test-model", converse: async () => replies.shift()! }),
      (err: unknown) => err instanceof ExplanationRejectedError && err.reasons.length === 2,
    );
  });
});

describe("explainAnomaly service", () => {
  it("is idempotent unless regenerate is requested, and returns schema-valid rows", async () => {
    delete process.env.BEDROCK_MODEL_ID;
    const a: Anomaly = { ...vendor, anomaly_id: "6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4eaa", status: "Needs review", created_at: "2026-10-08 02:00:00+00" };
    const saved = new Map<string, AnomalyExplanation>();
    const store: ExplanationStore = {
      getAnomaly: async (id) => (id === a.anomaly_id ? a : null),
      getExplanation: async (id) => saved.get(id) ?? null,
      saveExplanation: async (row) => {
        saved.set(row.anomaly_id, row);
        return row;
      },
    };

    const first = await explainAnomaly(a.anomaly_id, { store });
    const second = await explainAnomaly(a.anomaly_id, { store });
    const third = await explainAnomaly(a.anomaly_id, { store, regenerate: true });
    assert.deepEqual([first?.generated, second?.generated, third?.generated], [true, false, true]);
    assert.equal(anomalyExplanationSchema.safeParse(first?.explanation).success, true);
    assert.equal(await explainAnomaly("6f1c2b8e-3d4a-4c5b-9e7f-0a1b2c3d4e00", { store }), null);
  });
});

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
    assert.deepEqual(Object.keys(facts).sort(), ["category", "detectionMethod", "evidence", "score", "scoreMeaning"]);
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
