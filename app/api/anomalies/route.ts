import type { NextRequest } from "next/server";
import { listAnomalies } from "@/lib/data/anomalies";
import {
  anomalyPrioritySchema,
  anomalyStatusSchema,
  isoDateSchema,
  paginationQuerySchema,
  type AnomalyListResponse,
} from "@/lib/schemas";
import type { AnomalyFilters } from "@/lib/types/dashboard";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const text = (key: string, max: number) => sp.get(key)?.slice(0, max) || undefined;

  const filters: AnomalyFilters = {
    q: text("q", 100),
    category: text("category", 100),
    supplier_id: text("supplier_id", 50),
    priority: anomalyPrioritySchema.safeParse(sp.get("priority")).data,
    status: anomalyStatusSchema.safeParse(sp.get("status")).data,
    from: isoDateSchema.safeParse(sp.get("from")).data,
    to: isoDateSchema.safeParse(sp.get("to")).data,
  };

  const paging = paginationQuerySchema.safeParse({
    page: sp.get("page") ?? undefined,
    page_size: sp.get("page_size") ?? undefined,
  });
  if (!paging.success) return Response.json({ error: "Invalid page or page_size" }, { status: 400 });

  const { page, page_size } = paging.data;
  const all = await listAnomalies(filters);
  const body: AnomalyListResponse = {
    items: all.slice((page - 1) * page_size, page * page_size),
    page,
    page_size,
    total: all.length,
  };
  return Response.json(body);
}
