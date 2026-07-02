"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { WsRow, WorkspaceRow, PageHeading, LoadingBlock, ExportButton } from "@/components/admin/ui";
import { Checkbox } from "@/components/admin/Checkbox";

const PAGE_SIZE = 20;

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("search") ?? "") : ""
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const res = await api.get("/api/admin/workspaces", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      });
      setWorkspaces(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load workspaces");
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
      setSortDir("asc");
    }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === workspaces.length && workspaces.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(workspaces.map(w => w.id)));
    }
  };

  const batchAction = async (action: "enable" | "disable" | "delete") => {
    setBatchLoading(true);
    const ids = Array.from(selected);
    try {
      if (action === "delete") {
        await Promise.all(ids.map(id => api.delete(`/api/admin/workspaces/${id}`)));
        toast.success(`Deleted ${ids.length} workspace(s)`);
      } else {
        const isActive = action === "enable";
        await Promise.all(ids.map(id => api.put(`/api/admin/workspaces/${id}/status`, { is_active: isActive })));
        toast.success(`${action === "enable" ? "Enabled" : "Disabled"} ${ids.length} workspace(s)`);
      }
      load();
    } catch {
      toast.error(`Failed to ${action} workspaces`);
    } finally {
      setBatchLoading(false);
    }
  };

  function SortLabel({ label, field }: { label: string; field: string }) {
    const active = sortBy === field;
    return (
      <span className="inline-flex items-center gap-1">
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${active ? (sortDir === "asc" ? "rotate-180" : "") : "opacity-0"}`} />
      </span>
    );
  }

  return (
    <>
      <PageHeading
        title="Workspaces"
        subtitle="Every tenant — adjust credits, enable/disable, inspect members & billing"
        action={
          <div className="flex gap-2">
            <ExportButton rows={workspaces as unknown as Record<string, unknown>[]} filename="workspaces" />
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search workspaces…"
          className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
        />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl shadow-xs mt-4 overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-2.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-100 bg-neutral-50">
          <div className="w-4 flex-shrink-0">
            <Checkbox checked={selected.size === workspaces.length && workspaces.length > 0} onChange={toggleSelectAll} />
          </div>
          <div className="w-2 flex-shrink-0" />
          <div className="flex-1 min-w-0 cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort("name")}>
            <SortLabel label="Name" field="name" />
          </div>
          <div className="hidden sm:flex items-center gap-5 cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort("credits_balance")}>
            <SortLabel label="Balance" field="credits_balance" />
          </div>
          <div className="w-16 cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort("is_active")}>
            <SortLabel label="Status" field="is_active" />
          </div>
          <div className="w-8 flex-shrink-0" />
        </div>

        {loading ? (
          <LoadingBlock />
        ) : (
          <div>
            <p className="text-xs text-neutral-400 px-5 py-2 border-b border-neutral-50">
              {total} workspace{total !== 1 ? "s" : ""}
            </p>
            {workspaces.map(ws => (
              <WorkspaceRow
                key={ws.id}
                ws={ws}
                onRefresh={load}
                selected={selected.has(ws.id)}
                onToggleSelect={() => toggleSelect(ws.id)}
              />
            ))}
            {workspaces.length === 0 && (
              <p className="text-sm text-neutral-400 text-center py-10">No workspaces found.</p>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-neutral-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 bg-white border border-neutral-200 rounded-xl shadow-lg z-40 animate-fade-in">
          <span className="text-sm text-neutral-700 font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-neutral-200" />
          <button
            onClick={() => batchAction("enable")}
            disabled={batchLoading}
            className="text-sm font-medium text-success-600 hover:text-success-700 disabled:opacity-40 transition-colors"
          >
            Enable
          </button>
          <button
            onClick={() => batchAction("disable")}
            disabled={batchLoading}
            className="text-sm font-medium text-warning-600 hover:text-warning-700 disabled:opacity-40 transition-colors"
          >
            Disable
          </button>
          <button
            onClick={() => batchAction("delete")}
            disabled={batchLoading}
            className="text-sm font-medium text-error-600 hover:text-error-700 disabled:opacity-40 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
