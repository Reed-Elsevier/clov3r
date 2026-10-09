import { z } from "zod";
import { DEFAULT_RULE_CONFIG } from "./config";
import { buildContexts, calendarDay, timestampMilliseconds, type FinanceRows } from "./context";

export const invoiceFeaturesSchema = z.object({
  invoice_id: z.string().min(1),
  amount_usd: z.number().finite().nonnegative(),
  vendor_avg_usd: z.number().finite().nonnegative().nullable(),
  processing_days: z.number().finite().nonnegative(),
  ocr_confidence: z.number().finite().min(0).max(1).nullable(),
  supplier_exception_rate: z.number().finite().min(0).max(1),
}).strict();
export type InvoiceFeatures = z.infer<typeof invoiceFeaturesSchema>;

function countThrough(orderedDays: number[], day: number): number {
  let low = 0;
  let high = orderedDays.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (orderedDays[middle] <= day) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function engineerFeatures(rows: FinanceRows, asOfDate: string) {
  const contexts = buildContexts(rows, asOfDate, DEFAULT_RULE_CONFIG.duplicateWindowDays);
  const invoices = new Map(rows.invoices.map((invoice) => [invoice.invoice_id, invoice]));
  const firstExceptionDay = new Map<string, number>();
  for (const exception of rows.invoiceExceptions) {
    const invoice = invoices.get(exception.invoice_id);
    if (!invoice) continue;
    const availableDay = Math.max(calendarDay(invoice.invoice_date) + 1, Math.floor(timestampMilliseconds(exception.raised_at) / 86_400_000) + 1);
    firstExceptionDay.set(invoice.invoice_id, Math.min(firstExceptionDay.get(invoice.invoice_id) ?? Infinity, availableDay));
  }
  const supplierExceptionDays = new Map<string, number[]>();
  for (const [identifier, day] of firstExceptionDay) {
    const supplier = invoices.get(identifier)!.supplier_id;
    const days = supplierExceptionDays.get(supplier) ?? [];
    days.push(day);
    supplierExceptionDays.set(supplier, days);
  }
  for (const days of supplierExceptionDays.values()) days.sort((first, second) => first - second);
  const features: InvoiceFeatures[] = [];
  const skipped: { invoiceId: string; reason: string }[] = [];
  for (const invoice of rows.invoices) {
    const context = contexts.get(invoice.invoice_id)!;
    const processingDays = timestampMilliseconds(invoice.received_at) / 86_400_000 - calendarDay(invoice.invoice_date);
    const day = Math.min(calendarDay(invoice.invoice_date), Math.floor(timestampMilliseconds(invoice.received_at) / 86_400_000));
    const priorExceptions = countThrough(supplierExceptionDays.get(invoice.supplier_id) ?? [], day);
    const parsed = invoiceFeaturesSchema.safeParse({
      invoice_id: invoice.invoice_id,
      amount_usd: invoice.amount_usd,
      vendor_avg_usd: context.vendorAvgUsd,
      processing_days: processingDays,
      ocr_confidence: invoice.channel === "Email" ? invoice.ocr_confidence : null,
      supplier_exception_rate: context.vendorInvoiceCount > 0 ? priorExceptions / context.vendorInvoiceCount : 0,
    });
    if (parsed.success) features.push(parsed.data);
    else skipped.push({ invoiceId: invoice.invoice_id, reason: "Invalid numeric features, negative receipt delay, or confidence outside [0,1]" });
  }
  return { features, skipped };
}