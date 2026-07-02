"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, CalendarClock, Clock, AlertTriangle, CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";
import { Checkbox } from "@/components/admin/Checkbox";
import { api } from "@/lib/api";

const PAGE_SIZE = 50;

interface Sched {
  id: string; workspace_name: string; phone_number: string; contact_name: string | null;
  scheduled_at: string | null; status: string; error_message: string | null; call_id: string | null;
}
interface Resp { items: Sched[]; total: number }

const TONE: Record<string, "blue" | "emerald" | "red" | "amber" | "neutral"> = {
  pending: "blue", running: "amber", completed: "emerald", failed: "red", cancelled: "neutral",
};

export default function AdminScheduledPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("scheduled_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      setData(await adminGet("/scheduled-calls", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      }));
    } catch { toast.error("Failed to load scheduled calls"); }
    finally { setLoading(false); }
  }, [page, search, sortBy, sortDir]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const rows = filtered;
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(s => s.id)));
    }
  };

  const batchCancel = async () => {
    setBatchLoading(true);
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map(id => api.delete(`/api/scheduling/${id}`)));
      toast.success(`Cancelled ${ids.length} scheduled call(s)`);
      setSelected(new Set());
      load();
    } catch {
      toast.error("Failed to cancel scheduled calls");
    } finally {
      setBatchLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const rows = data?.items ?? [];
    return filter === "all" ? rows : rows.filter(s => s.status === filter);
  }, [data, filter]);

  const sum = useMemo(() => {
    const rows = data?.items ?? [];
    const counts: Record<string, number> = {};
    for (const s of rows) { counts[s.status] = (counts[s.status] || 0) + 1; }
    return counts;
  }, [data]);

  function SortLabel({ label, field }: { label: string; field: string }) {
    const active = sortBy === field;
    return (
      <span className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort(field)}>
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${active ? (sortDir === "asc" ? "rotate-180" : "") : "opacity-0"}`} />
      </span>
    );
  }

  return (
    <>
      <PageHeading
        title="Scheduled Calls"
        subtitle="Upcoming and failed scheduled calls across all workspaces"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiStat label="Pending" value={sum.pending ?? 0} icon={Clock} tint="bg-blue-50 text-info-600" />
            <KpiStat label="Failed" value={sum.failed ?? 0} icon={AlertTriangle} tint={(sum.failed ?? 0) > 0 ? "bg-error-50 text-error-600" : "bg-neutral-100 text-neutral-500"} />
            <KpiStat label="Completed" value={sum.completed ?? 0} icon={CheckCircle2} tint="bg-success-50 text-success-600" />
            <KpiStat label="Total" value={data.total} icon={CalendarClock} tint="bg-brand-50 text-brand-600" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search number or contact…"
                className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
            </div>
            {["all", "pending", "failed", "completed", "cancelled"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`h-9 px-3 rounded-lg text-xs font-medium border capitalize transition-colors ${filter === f ? "bg-brand-50 text-brand-600 border-brand-200" : "text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>
                  <th className="px-4 py-2.5 w-10">
                    <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Scheduled" field="scheduled_at" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Workspace" field="workspace_name" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Contact" field="contact_name" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Number" field="phone_number" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Status" field="status" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5">
                      <Checkbox checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{s.scheduled_at ? fmt(s.scheduled_at) : "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{s.workspace_name}</td>
                    <td className="px-4 py-2.5 text-neutral-500">{s.contact_name || "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">{s.phone_number}</td>
                    <td className="px-4 py-2.5"><Pill tone={TONE[s.status] ?? "neutral"}>{s.status}</Pill></td>
                    <td className="px-4 py-2.5 text-error-500 text-xs max-w-[220px] truncate" title={s.error_message ?? ""}>{s.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No scheduled calls</div>}
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

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 bg-white border border-neutral-200 rounded-xl shadow-lg z-40 animate-fade-in">
          <span className="text-sm text-neutral-700 font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-neutral-200" />
          <button onClick={batchCancel} disabled={batchLoading}
            className="h-8 px-3 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}
    </>
  );
}
