"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Webhook, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Search, ArrowUpDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface Delivery { event_type: string; status: number | null; ok: boolean; attempt_count: number; body: string; created_at: string | null }
interface Endpoint {
  id: string; workspace_name: string; url: string; events: string[]; is_active: boolean;
  total_deliveries: number; failed_deliveries: number; success_rate: number | null; last_delivery: string | null;
  last_error: string | null; recent_deliveries: Delivery[];
}

const SORT_FIELDS = [
  { label: "URL", field: "url" },
  { label: "Workspace", field: "workspace_name" },
  { label: "Deliveries", field: "total_deliveries" },
  { label: "Failed", field: "failed_deliveries" },
  { label: "Success Rate", field: "success_rate" },
  { label: "Last Delivery", field: "last_delivery" },
];

export default function AdminWebhooksPage() {
  const [items, setItems] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await adminGet("/webhooks", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      });
      setItems(resp.items ?? []);
      setTotal(resp.total ?? 0);
    } catch {
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHeading
        title="Webhooks"
        subtitle="Delivery health for every workspace's webhook endpoints"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiStat label="Endpoints" value={total} icon={Webhook} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Deliveries" value={items.reduce((s, e) => s + e.total_deliveries, 0).toLocaleString("en-IN")} icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" />
            <KpiStat label="Failed" value={items.reduce((s, e) => s + e.failed_deliveries, 0).toLocaleString("en-IN")} icon={AlertTriangle} tint={items.reduce((s, e) => s + e.failed_deliveries, 0) > 0 ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-500"} />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search URL or workspace…"
                className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              {SORT_FIELDS.map(f => {
                const active = sortBy === f.field;
                return (
                  <button key={f.field} onClick={() => handleSort(f.field)}
                    className={`h-7 px-2 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap
                      ${active
                        ? "bg-brand-50 text-brand-600 border-brand-200"
                        : "text-neutral-500 border-neutral-200 hover:bg-neutral-50 hover:text-neutral-700"}`}>
                    {f.label} {active && (sortDir === "asc" ? "↑" : "↓")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            {items.map(e => {
              const isOpen = open.has(e.id);
              return (
                <div key={e.id} className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[12.5px] text-neutral-800 truncate" title={e.url}>{e.url}</p>
                      <p className="text-xs text-neutral-400 truncate">{e.workspace_name} · {(e.events || []).join(", ") || "no events"}</p>
                      {e.last_error && <p className="text-[11px] text-red-500 truncate mt-0.5" title={e.last_error}>⚠ {e.last_error}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-neutral-500">{e.total_deliveries} sent{e.failed_deliveries > 0 && <span className="text-red-500"> · {e.failed_deliveries} failed</span>}</p>
                      {e.last_delivery && <p className="text-[11px] text-neutral-400">{fmt(e.last_delivery)}</p>}
                    </div>
                    {e.success_rate == null ? <Pill tone="neutral">no data</Pill>
                      : <Pill tone={e.success_rate >= 95 ? "emerald" : e.success_rate >= 70 ? "amber" : "red"}>{e.success_rate}%</Pill>}
                    {e.is_active ? <Pill tone="emerald">Active</Pill> : <Pill tone="neutral">Off</Pill>}
                    <button onClick={() => toggle(e.id)} disabled={!e.recent_deliveries.length}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 shrink-0" title="Recent deliveries">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {isOpen && e.recent_deliveries.length > 0 && (
                    <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Recent deliveries</p>
                      {e.recent_deliveries.map((d, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-[12px]">
                          <span className={`mt-0.5 px-1.5 py-0.5 rounded font-mono text-[11px] font-semibold shrink-0 ${d.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {d.status ?? "ERR"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-neutral-600">{d.event_type}</span>
                            <span className="text-neutral-400"> · {d.attempt_count} attempt{d.attempt_count === 1 ? "" : "s"} · {d.created_at ? fmt(d.created_at) : ""}</span>
                            {d.body && <p className="text-neutral-500 font-mono text-[11px] mt-0.5 break-all">{d.body}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No webhook endpoints configured</div>}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-neutral-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">Previous</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
