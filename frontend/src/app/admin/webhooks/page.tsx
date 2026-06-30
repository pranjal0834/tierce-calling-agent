"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Webhook, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";

interface Delivery { event_type: string; status: number | null; ok: boolean; attempt_count: number; body: string; created_at: string | null }
interface Endpoint {
  id: string; workspace_name: string; url: string; events: string[]; is_active: boolean;
  total_deliveries: number; failed_deliveries: number; success_rate: number | null; last_delivery: string | null;
  last_error: string | null; recent_deliveries: Delivery[];
}
interface Resp {
  endpoints: Endpoint[];
  summary: { total_endpoints: number; total_deliveries: number; total_failed: number };
}

export default function AdminWebhooksPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminGet("/webhooks")); }
    catch { toast.error("Failed to load webhooks"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

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

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiStat label="Endpoints" value={data.summary.total_endpoints} icon={Webhook} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Deliveries" value={data.summary.total_deliveries.toLocaleString("en-IN")} icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" />
            <KpiStat label="Failed" value={data.summary.total_failed.toLocaleString("en-IN")} icon={AlertTriangle} tint={data.summary.total_failed > 0 ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-500"} />
          </div>

          <div className="space-y-2.5">
            {data.endpoints.map(e => {
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
            {data.endpoints.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No webhook endpoints configured</div>}
          </div>
        </>
      )}
    </>
  );
}
