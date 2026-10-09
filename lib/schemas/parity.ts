/**
 * Compile-time guard: every Zod row schema must infer exactly the same type
 * as its Drizzle table's select type. If someone changes a column in one place
 * but not the other, `tsc --noEmit` (npm run typecheck) fails here.
 *
 * Type-only; nothing in this file exists at runtime.
 */
import type { z } from "zod";

import type * as db from "../db/schema";
import type * as anomaly from "./anomalies";
import type * as finance from "./finance";

type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type Assert<T extends true> = T;

type Same<
  Schema extends z.ZodType,
  Table extends { $inferSelect: unknown },
> = MutuallyAssignable<z.infer<Schema>, Table["$inferSelect"]>;

type Insertable<
  Schema extends z.ZodType,
  Table extends { $inferInsert: unknown },
> = [z.infer<Schema>] extends [Table["$inferInsert"]] ? true : false;

export type SchemaParityChecks = [
  Assert<Same<typeof finance.costCenterSchema, typeof db.costCenters>>,
  Assert<Same<typeof finance.supplierSchema, typeof db.suppliers>>,
  Assert<
    Same<
      typeof finance.supplierEnrollmentRequestSchema,
      typeof db.supplierEnrollmentRequests
    >
  >,
  Assert<Same<typeof finance.purchaseOrderSchema, typeof db.purchaseOrders>>,
  Assert<Same<typeof finance.invoiceSchema, typeof db.invoices>>,
  Assert<Same<typeof finance.invoiceLineSchema, typeof db.invoiceLines>>,
  Assert<Same<typeof finance.invoiceExceptionSchema, typeof db.invoiceExceptions>>,
  Assert<Same<typeof finance.paymentSchema, typeof db.payments>>,
  Assert<
    Same<typeof finance.opexBudgetVsActualSchema, typeof db.opexBudgetVsActual>
  >,
  Assert<Same<typeof anomaly.anomalySchema, typeof db.anomalies>>,
  Assert<Insertable<typeof anomaly.newAnomalySchema, typeof db.anomalies>>,
  Assert<
    Same<typeof anomaly.anomalyExplanationSchema, typeof db.anomalyExplanations>
  >,
  Assert<
    Insertable<
      typeof anomaly.newAnomalyExplanationSchema,
      typeof db.anomalyExplanations
    >
  >,
];
