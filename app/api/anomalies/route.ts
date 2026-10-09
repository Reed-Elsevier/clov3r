import type { NextRequest } from "next/server";
import { listAnomalies } from "@/lib/data/anomalies";
import {
  ANOMALY_PRIORITIES,
  ANOMALY_STATUSES,
  type AnomalyFilters,
  type AnomalyPriority,
  type AnomalyStatus,
} from "@/lib/types/dashboard";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const priority = sp.get("priority");
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");

  const filters: AnomalyFilters = {
    q: sp.get("q")?.slice(0, 100) || undefined,
    category: sp.get("category")?.slice(0, 100) || undefined,
    supplierId: sp.get("supplierId")?.slice(0, 50) || undefined,
    priority: ANOMALY_PRIORITIES.includes(priority as AnomalyPriority) ? (priority as AnomalyPriority) : undefined,
    status: ANOMALY_STATUSES.includes(status as AnomalyStatus) ? (status as AnomalyStatus) : undefined,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
  };

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || 50));
  const all = await listAnomalies(filters);

  return Response.json({
    data: all.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    total: all.length,
  });
}
