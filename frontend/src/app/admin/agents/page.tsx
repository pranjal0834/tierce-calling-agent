"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, Bot, ToggleLeft, ToggleRight, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminPut, PageHeading, KpiStat, Pill, LoadingBlock } from "@/components/admin/ui";
import { Checkbox } from "@/components/admin/Checkbox";
import { api } from "@/lib/api";

const PAGE_SIZE = 50;

interface AgentRow {
  id: string; name: string; workspace_name: string; workspace_id: string;
  pipeline_mode: string; is_active: boolean; call_count: number; cost_usd: number; created_at: string | null;
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await api.get("/api/admin/agents", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      });
      setAgents(resp.data.items ?? []);
      setTotal(resp.data.total ?? 0);
    } catch {
      toast.error("Failed to load agents");
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(a => a.id)));
    }
  };

  const batchAction = async (action: "enable" | "disable") => {
    setBatchLoading(true);
    const ids = Array.from(selected);
    try {
      const isActive = action === "enable";
      await Promise.all(ids.map(id => adminPut(`/agents/${id}/status`, { is_active: isActive })));
      toast.success(`${action === "enable" ? "Enabled" : "Disabled"} ${ids.length} agent(s)`);
      setSelected(new Set());
      load();
    } catch {
      toast.error(`Failed to ${action} agents`);
    } finally {
      setBatchLoading(false);
    }
  };

  async function toggle(a: AgentRow) {
    setBusy(a.id);
    try {
      await adminPut(`/agents/${a.id}/status`, { is_active: !a.is_active });
      setAgents(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(`Agent ${a.is_active ? "disabled" : "enabled"}`);
    } catch { toast.error("Failed to update agent"); }
    finally { setBusy(null); }
  }

  const filtered = useMemo(() => {
    return agents.filter(a =>
      filter === "all" || (filter === "active" ? a.is_active : !a.is_active)
    );
  }, [agents, filter]);

  const totalCost = agents.reduce((s, a) => s + (a.cost_usd || 0), 0);

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
        title="Agents"
        subtitle="Every agent across all workspaces — search, inspect cost, and disable offending agents"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiStat label="Total Agents" value={total} icon={Bot} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Active" value={agents.filter(a => a.is_active).length} icon={ToggleRight} tint="bg-emerald-50 text-emerald-600" />
            <KpiStat label="Disabled" value={agents.filter(a => !a.is_active).length} icon={ToggleLeft} tint="bg-neutral-100 text-neutral-500" />
            <KpiStat label="Total AI Cost" value={`$${totalCost.toFixed(2)}`} icon={Bot} tint="bg-amber-50 text-amber-600" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search agent or workspace…"
                className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
            </div>
            {(["all", "active", "disabled"] as const).map(f => (
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
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Agent" field="name" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Workspace" field="workspace_name" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Engine" field="pipeline_mode" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Calls" field="call_count" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Cost" field="cost_usd" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Status" field="is_active" /></th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5">
                      <Checkbox checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{a.name}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{a.workspace_name}</td>
                    <td className="px-4 py-2.5 text-neutral-500 capitalize">{a.pipeline_mode}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{a.call_count}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{a.cost_usd > 0 ? `$${a.cost_usd.toFixed(4)}` : "—"}</td>
                    <td className="px-4 py-2.5">{a.is_active ? <Pill tone="emerald">Active</Pill> : <Pill tone="neutral">Disabled</Pill>}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => toggle(a)} disabled={busy === a.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 disabled:opacity-40">
                        {a.is_active ? <><ToggleRight className="w-4 h-4 text-emerald-500" /> Disable</> : <><ToggleLeft className="w-4 h-4" /> Enable</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No agents found</div>}
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
          <button onClick={() => batchAction("enable")} disabled={batchLoading}
            className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">Enable</button>
          <button onClick={() => batchAction("disable")} disabled={batchLoading}
            className="h-8 px-3 bg-neutral-600 text-white rounded-lg text-xs font-medium hover:bg-neutral-700 disabled:opacity-50 transition-colors">Disable</button>
        </div>
      )}
    </>
  );
}
