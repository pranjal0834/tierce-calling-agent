"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, Phone, ArrowUpDown } from "lucide-react";
import toast from "react-hot-toast";
import { CallRow, AdminCallRow, PageHeading, LoadingBlock, ExportButton } from "@/components/admin/ui";
import { api } from "@/lib/api";

const PAGE_SIZE = 50;

const SORT_FIELDS = [
  { label: "Date", field: "created_at" },
  { label: "Number", field: "phone_number" },
  { label: "Status", field: "status" },
  { label: "Duration", field: "duration_seconds" },
  { label: "Cost", field: "cost_usd" },
  { label: "Engine", field: "pipeline_mode" },
];

export default function AdminCallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Pre-fill the search from a ?search= param (e.g. "view all calls" from a workspace).
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("search") ?? "") : ""
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await api.get("/api/admin/calls", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      });
      setCalls(resp.data.items ?? []);
      setTotal(resp.data.total ?? 0);
    } catch {
      toast.error("Failed to load calls");
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

  return (
    <>
      <PageHeading
        title="Calls"
        subtitle="Recent calls across all workspaces — tap a row for its cost breakdown"
        action={
          <div className="flex gap-2">
            <ExportButton rows={calls.map(({ cost_breakdown, ...r }) => r) as unknown as Record<string, unknown>[]} filename="calls" />
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search number or workspace…"
            className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
          />
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

      {loading ? <LoadingBlock /> : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500 mb-1">{calls.length} of {total} calls</p>
          {calls.map(c => <AdminCallRow key={c.id} c={c} />)}
          {calls.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
                <Phone className="w-7 h-7 text-neutral-400" />
              </div>
              <p className="text-sm font-medium text-neutral-500">No calls found</p>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">Previous</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
