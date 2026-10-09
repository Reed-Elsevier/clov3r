import "../lib/db/load-env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDb } from "../lib/db/client";
import { mockInvoices, mockInvoiceLines, mockPurchaseOrders, mockPayments, mockInvoiceExceptions } from "../lib/fixtures";
import { runRules, validationMetrics, RULE_LABELS } from "../lib/detectors/batch";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "../lib/detectors/config";
import { calendarDay } from "../lib/detectors/context";
import { readFinanceCsv, readFinanceDatabase } from "../lib/detectors/dataset";
import { engineerFeatures } from "../lib/detectors/features";
import { scoreInvoices } from "../lib/detectors/isolation-forest-client";
import { saveAnomalies } from "../lib/detectors/persistence";

const ruleConfigSchema = z.object({
  duplicateWindowDays: z.number().int().nonnegative(),
  duplicateAmountToleranceUsd: z.number().finite().nonnegative(),
  vendorAmountMultiplier: z.number().finite().gt(1),
  minimumVendorHistory: z.number().int().positive(),
  mediumAmountUsd: z.number().finite().nonnegative(),
  highAmountUsd: z.number().finite().nonnegative(),
  highOverdueDays: z.number().int().positive(),
  roundingTolerance: z.object({ USD: z.number().nonnegative(), EUR: z.number().nonnegative(), GBP: z.number().nonnegative(), PHP: z.number().nonnegative(), JPY: z.number().nonnegative() }).strict(),
}).strict().refine((config) => config.highAmountUsd >= config.mediumAmountUsd, "High priority amount must be at least the medium amount");

async function writeJson(path: string, payload: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const { values } = parseArgs({ options: {
    source: { type: "string", default: "csv" },
    dataset: { type: "string", default: "dataset/G_finance" },
    "as-of": { type: "string" },
    config: { type: "string" },
    score: { type: "boolean", default: false },
    persist: { type: "boolean", default: false },
    "features-out": { type: "string" },
    "report-out": { type: "string" },
  } });
  if (!values["as-of"]) throw new Error("Specify --as-of YYYY-MM-DD for reproducible overdue evaluation");
  calendarDay(values["as-of"]);
  let config: RuleConfig = DEFAULT_RULE_CONFIG;
  if (values.config) {
    const overrides = JSON.parse(await readFile(values.config, "utf8"));
    config = ruleConfigSchema.parse({ ...DEFAULT_RULE_CONFIG, ...overrides, roundingTolerance: { ...DEFAULT_RULE_CONFIG.roundingTolerance, ...overrides.roundingTolerance } });
  }
  if (values.persist && values.source !== "db") throw new Error("--persist requires --source db; fixture/CSV IDs may not exist in the database");
  const rows = values.source === "db" ? await readFinanceDatabase() : values.source === "csv" ? await readFinanceCsv(values.dataset!) : values.source === "fixture" ? {
    invoices: mockInvoices, invoiceLines: mockInvoiceLines, purchaseOrders: mockPurchaseOrders, payments: mockPayments, invoiceExceptions: mockInvoiceExceptions,
  } : null;
  if (!rows) throw new Error("Source must be csv, db, or fixture");
  const ruleAnomalies = runRules(rows, values["as-of"], config);
  const engineered = engineerFeatures(rows, values["as-of"]);
  if (values["features-out"]) await writeJson(values["features-out"], { features: engineered.features });
  const modelAnomalies = values.score ? await scoreInvoices(engineered.features) : [];
  const anomalies = [...ruleAnomalies, ...modelAnomalies];
  const inserted = values.persist ? await saveAnomalies(anomalies) : 0;
  const coveredLabels = new Set(Object.values(RULE_LABELS).flat());
  const report = {
    source: values.source === "fixture" ? "HAND-BUILT SYNTHETIC FIXTURES: NOT REAL DATASET FINDINGS" : values.source,
    asOfDate: values["as-of"],
    invoiceCount: rows.invoices.length,
    ruleAnomalyCount: ruleAnomalies.length,
    modelAnomalyCount: modelAnomalies.length,
    inserted,
    config,
    metrics: validationMetrics(ruleAnomalies, rows.invoiceExceptions, rows.invoices.map((invoice) => invoice.invoice_id)),
    unsupportedExceptionTypes: [...new Set(rows.invoiceExceptions.filter((row) => !coveredLabels.has(row.exception_type)).map((row) => row.exception_type))],
    skippedModelRows: engineered.skipped,
    caveat: "Precision/recall measure agreement with upstream exception labels, not verified fraud accuracy. Unlabeled detections require human review.",
  };
  console.log(JSON.stringify(report, null, 2));
  if (values["report-out"]) await writeJson(values["report-out"], report);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Anomaly batch failed");
  process.exitCode = 1;
}).finally(closeDb);