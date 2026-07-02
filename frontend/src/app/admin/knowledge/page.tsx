"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, BookOpen, FileText, DollarSign, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, LoadingBlock, ExportButton } from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface KbRow { workspace: string; workspace_id: string; kbs: number; docs: number; chunks: number; chars: number; embed_usd: number }

export default function AdminKnowledgePage() {
  const [rows, setRows] = useState<KbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("docs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await adminGet("/knowledge", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      });
      setRows(resp.items ?? []);
      setTotal(resp.total ?? 0);
    } catch {
      toast.error("Failed to load knowledge audit");
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
        title="Knowledge Bases"
        subtitle="Storage usage and embedding cost per workspace"
        action={
          <div className="flex gap-2">
            {rows.length > 0 && <ExportButton rows={rows as unknown as Record<string, unknown>[]} filename="kb-audit" />}
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiStat label="Workspaces with KB" value={total} icon={BookOpen} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Total Documents" value={rows.reduce((s, w) => s + w.docs, 0).toLocaleString("en-IN")} icon={FileText} tint="bg-blue-50 text-blue-600" />
            <KpiStat label="Embedding Cost" value={`$${rows.reduce((s, w) => s + w.embed_usd, 0).toFixed(4)}`} icon={DollarSign} tint="bg-amber-50 text-amber-600" sub="one-time ingestion" />
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
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="KBs" field="kbs" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Docs" field="docs" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Chunks" field="chunks" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Characters" field="chars" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Embed Cost" field="embed_usd" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(w => (
                  <tr key={w.workspace_id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{w.workspace}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{w.kbs}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{w.docs}</td>
                    <td className="px-4 py-2.5 text-neutral-500">{w.chunks.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5 text-neutral-500">{w.chars.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{w.embed_usd > 0 ? `$${w.embed_usd.toFixed(4)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No knowledge bases yet</div>}
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
