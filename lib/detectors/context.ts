import type { Invoice, InvoiceException, InvoiceLine, Payment, PurchaseOrder } from "../schemas";

export interface FinanceRows {
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  purchaseOrders: PurchaseOrder[];
  payments: Payment[];
  invoiceExceptions: InvoiceException[];
}

export interface RelatedRows {
  asOfDate: string;
  candidates: Invoice[];
  lines: InvoiceLine[];
  purchaseOrder?: PurchaseOrder;
  payments: Payment[];
  vendorAvgUsd: number | null;
  vendorInvoiceCount: number;
  poInvoicedTotal: number | null;
  isFinalPoInvoice: boolean;
}

export function calendarDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid calendar date: ${value}`);
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return milliseconds / 86_400_000;
}

export function timestampMilliseconds(value: string): number {
  calendarDay(value.slice(0, 10));
  const normalized = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const withZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(normalized) ? normalized : `${normalized}Z`;
  const milliseconds = Date.parse(withZone);
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid timestamp: ${value}`);
  return milliseconds;
}

export function groupBy<Row>(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value) ?? [];
    group.push(row);
    groups.set(value, group);
  }
  return groups;
}

export function buildContexts(rows: FinanceRows, asOfDate: string, duplicateWindowDays: number): Map<string, RelatedRows> {
  calendarDay(asOfDate);
  const supplierInvoices = groupBy(rows.invoices, (invoice) => invoice.supplier_id);
  const lines = groupBy(rows.invoiceLines, (line) => line.invoice_id);
  const payments = groupBy(rows.payments, (payment) => payment.invoice_id);
  const purchaseOrders = new Map(rows.purchaseOrders.map((order) => [order.po_id, order]));
  const poInvoices = groupBy(rows.invoices.filter((invoice) => invoice.po_id !== null), (invoice) => invoice.po_id!);
  const poSummaries = new Map<string, { total: number | null; finalInvoiceId: string }>();
  for (const [identifier, linkedInvoices] of poInvoices) {
    const order = purchaseOrders.get(identifier);
    const ordered = [...linkedInvoices].sort((first, second) => first.invoice_date.localeCompare(second.invoice_date) || first.invoice_id.localeCompare(second.invoice_id));
    const complete = linkedInvoices.every((linked) => (lines.get(linked.invoice_id)?.length ?? 0) > 0 && linked.currency === order?.currency && linked.supplier_id === order?.supplier_id);
    const total = complete ? linkedInvoices.reduce((sum, linked) => sum + (lines.get(linked.invoice_id) ?? []).reduce((subtotal, line) => subtotal + line.line_amount, 0), 0) : null;
    poSummaries.set(identifier, { total, finalInvoiceId: ordered[ordered.length - 1].invoice_id });
  }
  const contexts = new Map<string, RelatedRows>();
  for (const invoices of supplierInvoices.values()) {
    const ordered = [...invoices].sort((first, second) => first.invoice_date.localeCompare(second.invoice_date) || first.invoice_id.localeCompare(second.invoice_id));
    let historicalTotal = 0;
    let historicalCount = 0;
    let historyCursor = 0;
    let windowStart = 0;
    let windowEnd = 0;
    for (const invoice of ordered) {
      while (historyCursor < ordered.length && ordered[historyCursor].invoice_date < invoice.invoice_date) {
        historicalTotal += ordered[historyCursor].amount_usd;
        historicalCount++;
        historyCursor++;
      }
      const day = calendarDay(invoice.invoice_date);
      while (windowStart < ordered.length && calendarDay(ordered[windowStart].invoice_date) < day - duplicateWindowDays) windowStart++;
      while (windowEnd < ordered.length && calendarDay(ordered[windowEnd].invoice_date) <= day + duplicateWindowDays) windowEnd++;
      const po = invoice.po_id ? purchaseOrders.get(invoice.po_id) : undefined;
      const poSummary = invoice.po_id ? poSummaries.get(invoice.po_id) : undefined;
      contexts.set(invoice.invoice_id, {
        asOfDate,
        candidates: ordered.slice(windowStart, windowEnd),
        lines: lines.get(invoice.invoice_id) ?? [],
        purchaseOrder: po,
        payments: payments.get(invoice.invoice_id) ?? [],
        vendorAvgUsd: historicalCount > 0 ? historicalTotal / historicalCount : null,
        vendorInvoiceCount: historicalCount,
        poInvoicedTotal: poSummary?.total ?? null,
        isFinalPoInvoice: poSummary?.finalInvoiceId === invoice.invoice_id,
      });
    }
  }
  return contexts;
}