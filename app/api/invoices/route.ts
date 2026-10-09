import type { NextRequest } from "next/server";

import { listInvoices } from "@/lib/metrics/queries";
import { invoiceListQuerySchema } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  const query = invoiceListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) {
    return Response.json({ error: "Invalid query", issues: query.error.issues }, { status: 400 });
  }

  try {
    return Response.json(await listInvoices(query.data));
  } catch (err) {
    console.error("GET /api/invoices failed", err);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
