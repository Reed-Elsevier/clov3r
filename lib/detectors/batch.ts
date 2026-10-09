import type { InvoiceException, NewAnomaly } from "../schemas";
import type { InvoiceExceptionType } from "../schemas/enums";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "./config";
import { buildContexts, groupBy, type FinanceRows } from "./context";
import { detectDuplicateInvoice, detectMissingPo, detectOverdueInvoice, detectPriceQuantityMismatch, detectTaxTotalError, detectUnusualVendorTransaction } from "./rules";

export const RULE_LABELS: Record<string, readonly InvoiceExceptionType[]> = {
  "Duplicate invoice": ["Duplicate suspected"],
  "Missing PO": ["Missing PO"],
  "Price/quantity mismatch": ["Price mismatch", "Quantity mismatch"],
  "Tax/total error": ["Tax error"],
  "Overdue invoice": [],
  "Unusual vendor transaction": [],
};

export function runRules(rows: FinanceRows, asOfDate: string, config: RuleConfig = DEFAULT_RULE_CONFIG): NewAnomaly[] {
  const contexts = buildContexts(rows, asOfDate, config.duplicateWindowDays);
  const exceptions = groupBy(rows.invoiceExceptions, (exception) => exception.invoice_id);
  const detectors = [detectDuplicateInvoice, detectMissingPo, detectPriceQuantityMismatch, detectTaxTotalError, detectOverdueInvoice, detectUnusualVendorTransaction];
  return rows.invoices.flatMap((invoice) => detectors.flatMap((detector) => {
    const result = detector(invoice, contexts.get(invoice.invoice_id)!, config);
    if (!result) return [];
    const labels = RULE_LABELS[result.category];
    return [{ ...result, evidence: { ...result.evidence, groundTruthExceptionIds: (exceptions.get(invoice.invoice_id) ?? []).filter((exception) => labels.includes(exception.exception_type)).map((exception) => exception.exception_id) } }];
  }));
}

export function validationMetrics(anomalies: NewAnomaly[], exceptions: InvoiceException[], invoiceIds: string[]) {
  const universe = new Set(invoiceIds);
  return Object.entries(RULE_LABELS).map(([category, labels]) => {
    const predicted = new Set(anomalies.filter((anomaly) => anomaly.category === category && anomaly.method === "rule" && universe.has(anomaly.invoice_id)).map((anomaly) => anomaly.invoice_id));
    const labeled = new Set(exceptions.filter((exception) => universe.has(exception.invoice_id) && labels.includes(exception.exception_type)).map((exception) => exception.invoice_id));
    const truePositives = [...predicted].filter((identifier) => labeled.has(identifier)).length;
    return {
      category,
      evaluation: labels.length > 0 ? "label agreement" : "unlabeled",
      detected: predicted.size,
      labeled: labeled.size,
      truePositives: labels.length > 0 ? truePositives : null,
      unmatchedAlerts: labels.length > 0 ? predicted.size - truePositives : null,
      missedLabels: labels.length > 0 ? labeled.size - truePositives : null,
      precision: labels.length > 0 && predicted.size > 0 ? truePositives / predicted.size : null,
      recall: labels.length > 0 && labeled.size > 0 ? truePositives / labeled.size : null,
    };
  });
}