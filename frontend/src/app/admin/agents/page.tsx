"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, Bot, ToggleLeft, ToggleRight } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, adminPut, PageHeading, KpiStat, Pill, LoadingBlock } from "@/components/admin/ui";

interface AgentRow {
  id: string; name: string; workspace_name: string; workspace_id: string;
  pipeline_mode: string; is_active: boolean; call_count: number; cost_usd: number; created_at: string | null;
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "disabled">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAgents(await adminGet("/agents")); }
    catch { toast.error("Failed to load agents"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

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
    const q = search.trim().toLowerCase();
    return agents.filter(a =>
      (filter === "all" || (filter === "active" ? a.is_active : !a.is_active)) &&
      (!q || a.name.toLowerCase().includes(q) || a.workspace_name.toLowerCase().includes(q))
    );
  }, [agents, search, filter]);

  const totalCost = agents.reduce((s, a) => s + (a.cost_usd || 0), 0);

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
            <KpiStat label="Total Agents" value={agents.length} icon={Bot} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Active" value={agents.filter(a => a.is_active).length} icon={ToggleRight} tint="bg-emerald-50 text-emerald-600" />
            <KpiStat label="Disabled" value={agents.filter(a => !a.is_active).length} icon={ToggleLeft} tint="bg-neutral-100 text-neutral-500" />
            <KpiStat label="Total AI Cost" value={`$${totalCost.toFixed(2)}`} icon={Bot} tint="bg-amber-50 text-amber-600" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agent or workspace…"
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
                <tr>{["Agent", "Workspace", "Engine", "Calls", "Cost", "Status", ""].map(h => <th key={h} className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-neutral-50/60">
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
        </>
      )}
    </>
  );
}
