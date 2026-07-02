"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, MessageCircle, CheckCircle2, Bot, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock } from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface WsRow { workspace: string; workspace_id: string; connected: boolean; enabled_agents: number; total_agents: number }
interface Resp { items: WsRow[]; total: number }

export default function AdminWhatsAppPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("workspace");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      setData(await adminGet("/whatsapp", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      }));
    } catch { toast.error("Failed to load WhatsApp usage"); }
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
        title="WhatsApp"
        subtitle="Which workspaces have connected WhatsApp and how many agents use it"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <KpiStat label="Connected" value={data.items.filter(w => w.connected).length} icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" sub="workspaces with WhatsApp" />
            <KpiStat label="Using WhatsApp" value={data.total} icon={MessageCircle} tint="bg-brand-50 text-brand-600" sub="connected or enabled" />
          </div>

          <div className="relative max-w-sm mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search workspace…"
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Workspace" field="workspace" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Connected" field="connected" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Enabled Agents" field="enabled_agents" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Total Agents" field="total_agents" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.items.map(w => (
                  <tr key={w.workspace_id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{w.workspace}</td>
                    <td className="px-4 py-2.5">{w.connected ? <Pill tone="emerald">Connected</Pill> : <Pill tone="neutral">Not connected</Pill>}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-neutral-700"><Bot className="w-3.5 h-3.5 text-neutral-400" />{w.enabled_agents}</span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500">{w.total_agents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No workspaces using WhatsApp yet</div>}
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

          <p className="text-xs text-neutral-400">WhatsApp is a paid add-on — only workspaces that connected their own number or enabled it on an agent are shown.</p>
        </>
      )}
    </>
  );
}
