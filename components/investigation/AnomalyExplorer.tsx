"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { fetchAnomalyDetail, requestExplanation, setAnomalyStatus } from "@/app/(dashboard)/investigation/actions";
import { EmptyState } from "@/components/dashboard/Panel";
import { PriorityBadge, StatusBadge, Tag } from "@/components/dashboard/ui";
import { formatUsd } from "@/lib/format";
import {
  ANOMALY_PRIORITIES,
  ANOMALY_STATUSES,
  type AnomalyDetail,
  type AnomalyEvidence,
  type AnomalyListItem,
  type AnomalyMethod,
} from "@/lib/types/dashboard";

const METHOD_LABEL: Record<AnomalyMethod, string> = {
  rule: "Business rule",
  statistical: "Statistical outlier",
  isolation_forest: "Isolation Forest",
};

export function AnomalyExplorer({ initialRows, initialQuery = "" }: { initialRows: AnomalyListItem[]; initialQuery?: string }) {
  const [rows, setRows] = useState(initialRows);
  const [q, setQ] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(initialRows.map((r) => r.category))].sort(), [initialRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!needle ||
          [r.invoice_id, r.invoice_number, r.supplier_name, r.category].some((v) => v.toLowerCase().includes(needle))) &&
        (!category || r.category === category) &&
        (!priority || r.priority === priority) &&
        (!status || r.status === status),
    );
  }, [rows, q, category, priority, status]);

  const onUpdated = (d: AnomalyDetail) =>
    setRows((prev) =>
      prev.map((r) =>
        r.anomaly_id === d.anomaly.anomaly_id ? { ...r, status: d.anomaly.status, has_explanation: d.explanation !== null } : r,
      ),
    );
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const selectClass = "rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand focus:outline-none";

  return (
    <section className="flex flex-col rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invoice, supplier, category…"
          className={`${selectClass} min-w-56 flex-1`}
          aria-label="Search anomalies"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass} aria-label="Priority">
          <option value="">All priorities</option>
          {ANOMALY_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass} aria-label="Status">
          <option value="">All statuses</option>
          {ANOMALY_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-xs text-gray-500">{filtered.length} of {rows.length}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No anomalies match these filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="pb-3 font-medium">Invoice</th>
                <th className="pb-3 font-medium">Anomaly</th>
                <th className="pb-3 font-medium">Priority</th>
                <th className="pb-3 font-medium">Evidence</th>
                <th className="pb-3 text-right font-medium">Amount</th>
                <th className="pb-3 pl-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.anomaly_id}
                  onClick={() => setSelectedId(r.anomaly_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedId(r.anomaly_id);
                  }}
                  tabIndex={0}
                  className={`cursor-pointer transition-colors hover:bg-brand-100/40 focus:bg-brand-100/40 focus:outline-none ${selectedId === r.anomaly_id ? "bg-brand-100/60" : ""}`}
                >
                  <td className="py-3 pr-3">
                    <p className="font-medium text-gray-900">{r.invoice_id}</p>
                    <p className="text-xs text-gray-500">{r.supplier_name}</p>
                  </td>
                  <td className="py-3 pr-3">
                    <p className="text-gray-900">{r.category}</p>
                    <p className="text-xs text-gray-500">
                      {METHOD_LABEL[r.method]}
                      {r.has_explanation && <span className="ml-1.5 text-brand-600">· AI explained</span>}
                    </p>
                  </td>
                  <td className="py-3 pr-3"><PriorityBadge priority={r.priority} /></td>
                  <td className="max-w-xs py-3 pr-3 text-gray-700">{evidenceSummary(r.evidence)}</td>
                  <td className="py-3 text-right tabular-nums text-gray-900">{formatUsd(r.amount_usd)}</td>
                  <td className="py-3 pl-4"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <DetailDrawer key={selectedId} anomalyId={selectedId} onClose={closeDrawer} onUpdated={onUpdated} />
      )}
    </section>
  );
}

function DetailDrawer({
  anomalyId,
  onClose,
  onUpdated,
}: {
  anomalyId: string;
  onClose: () => void;
  onUpdated: (d: AnomalyDetail) => void;
}) {
  const [detail, setDetail] = useState<AnomalyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetchAnomalyDetail(anomalyId)
      .then((d) => {
        if (cancelled) return;
        if (d) setDetail(d);
        else setError("Anomaly not found.");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this anomaly.");
      });
    return () => {
      cancelled = true;
    };
  }, [anomalyId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (fn: () => Promise<AnomalyDetail | null>) =>
    startTransition(async () => {
      try {
        const d = await fn();
        if (d) {
          setDetail(d);
          onUpdated(d);
        }
      } catch {
        setError("Action failed. Please try again.");
      }
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Anomaly details">
      <button type="button" aria-label="Close details" className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-gray-100 shadow-2xl">
        <header className="flex items-start justify-between gap-3 bg-gray-900 p-5 text-white">
          <div>
            <p className="text-xs text-gray-300">{detail?.invoice.invoice_number ?? "…"}</p>
            <h2 className="text-lg font-semibold">{detail ? `${detail.invoice.invoice_id} · ${detail.anomaly.category}` : "Loading…"}</h2>
            {detail && (
              <p className="text-sm text-gray-300">
                {detail.supplier.supplier_name} · {formatUsd(detail.invoice.amount_usd)} · {detail.invoice.invoice_date}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Close">
            ✕
          </button>
        </header>

        {error && <p className="m-5 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}

        {detail && (
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={detail.anomaly.priority} />
              <Tag tone="gray">{METHOD_LABEL[detail.anomaly.method]}</Tag>
              {detail.anomaly.score !== null && <Tag tone="gray">Score {detail.anomaly.score}</Tag>}
            </div>

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Detected evidence</h3>
                <Tag tone="gray">System output</Tag>
              </div>
              <EvidenceList evidence={detail.anomaly.evidence} />
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Invoice &amp; supplier</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Fact label="PO" value={detail.invoice.po_id ?? "None"} />
                <Fact label="Due date" value={detail.invoice.due_date} />
                <Fact label="Invoice status" value={detail.invoice.status} />
                <Fact label="Approval level" value={detail.invoice.approval_level} />
                <Fact label="Channel" value={detail.invoice.channel} />
                <Fact
                  label="Gross amount"
                  value={formatMoney(detail.invoice.gross_amount, detail.invoice.currency)}
                />
                <Fact label="Supplier category" value={detail.supplier.category} />
                <Fact label="Supplier risk tier" value={detail.supplier.risk_tier} />
              </dl>
            </section>

            <section className="rounded-2xl border-2 border-dashed border-brand/40 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">AI explanation</h3>
                <Tag>AI-generated · verify before acting</Tag>
              </div>
              {detail.explanation ? (
                <div className="space-y-3 text-sm text-gray-700">
                  <p>{detail.explanation.explanation}</p>
                  <div>
                    <p className="font-medium text-gray-900">Evidence cited</p>
                    <p>{detail.explanation.evidence_summary}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Potential impact</p>
                    <p>{detail.explanation.potential_impact}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Recommended actions</p>
                    <ol className="ml-5 list-decimal space-y-1">
                      {detail.explanation.recommended_actions.map((a) => <li key={a}>{a}</li>)}
                    </ol>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Preventive measure</p>
                    <p>{detail.explanation.preventive_measure}</p>
                  </div>
                  {detail.explanation.requires_human_review && (
                    <p className="rounded-xl bg-warning/15 px-3 py-2 text-xs font-medium text-gray-900">Requires human review before any action.</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Model {detail.explanation.model_id} · {detail.explanation.generated_at}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3 text-sm text-gray-500">
                  <p>No explanation generated yet.</p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => requestExplanation(detail.anomaly.anomaly_id))}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {pending ? "Generating…" : "Generate explanation"}
                  </button>
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">Review status</h3>
              <div className="flex flex-wrap gap-2">
                {ANOMALY_STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pending || s === detail.anomaly.status}
                    onClick={() => run(() => setAnomalyStatus(detail.anomaly.anomaly_id, s))}
                    aria-pressed={s === detail.anomaly.status}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default ${
                      s === detail.anomaly.status
                        ? "border-brand bg-brand text-white"
                        : "border-gray-300 text-gray-700 hover:border-brand hover:text-brand-600 disabled:opacity-60"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">Findings are recommendations for human review, not automatic rejections.</p>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function evidenceSummary(evidence: AnomalyEvidence) {
  return typeof evidence.summary === "string" ? evidence.summary : "—";
}

function formatMoney(n: number, currency: string) {
  return n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
}

/** camelCase evidence keys -> "Matched invoice id", "Amount (USD)". */
function humanize(key: string) {
  const s = key
    .replace(/Usd$/, " (USD)")
    .replace(/Pct$/, " (%)")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1).replace("(usd)", "(USD)");
}

const MONEY_KEY = /amount|total|difference|mean|avg|std/i;

function formatEvidenceValue(key: string, v: unknown, currency?: string): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    if (key.endsWith("Usd")) return formatUsd(v);
    if (key.endsWith("Pct")) return `${v}%`;
    if (currency && MONEY_KEY.test(key)) return formatMoney(v, currency);
    return v.toLocaleString("en-US");
  }
  if (Array.isArray(v)) return v.map((x) => formatEvidenceValue(key, x, currency)).join(", ") || "None";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${humanize(k)}: ${formatEvidenceValue(k, x, currency)}`)
      .join(" · ");
  }
  return String(v);
}

function EvidenceList({ evidence }: { evidence: AnomalyEvidence }) {
  const currency = typeof evidence.currency === "string" ? evidence.currency : undefined;
  const entries = Object.entries(evidence).filter(([k]) => k !== "summary");
  return (
    <div className="space-y-3">
      {typeof evidence.summary === "string" && <p className="text-sm text-gray-900">{evidence.summary}</p>}
      {entries.length ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className={`rounded-xl bg-gray-100 px-3 py-2 ${v && typeof v === "object" && !Array.isArray(v) ? "sm:col-span-2" : ""}`}>
              <dt className="text-xs text-gray-500">{k === "groundTruthExceptionIds" ? "Matching dataset exceptions" : humanize(k)}</dt>
              <dd className="font-medium text-gray-900">{formatEvidenceValue(k, v, currency)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-gray-500">No evidence recorded.</p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-100 px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}
