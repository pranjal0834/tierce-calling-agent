"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, BookOpen, FileText, DollarSign } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, LoadingBlock, ExportButton } from "@/components/admin/ui";

interface KbRow { workspace: string; workspace_id: string; kbs: number; docs: number; chunks: number; chars: number; embed_usd: number }
interface Resp { workspaces: KbRow[]; summary: { total_docs: number; total_embed_usd: number; workspaces: number } }

export default function AdminKnowledgePage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminGet("/knowledge")); }
    catch { toast.error("Failed to load knowledge audit"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeading
        title="Knowledge Bases"
        subtitle="Storage usage and embedding cost per workspace"
        action={
          <div className="flex gap-2">
            {data && <ExportButton rows={data.workspaces as unknown as Record<string, unknown>[]} filename="kb-audit" />}
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiStat label="Workspaces with KB" value={data.summary.workspaces} icon={BookOpen} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Total Documents" value={data.summary.total_docs.toLocaleString("en-IN")} icon={FileText} tint="bg-blue-50 text-blue-600" />
            <KpiStat label="Embedding Cost" value={`$${data.summary.total_embed_usd.toFixed(4)}`} icon={DollarSign} tint="bg-amber-50 text-amber-600" sub="one-time ingestion" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>{["Workspace", "KBs", "Docs", "Chunks", "Characters", "Embed Cost"].map(h => <th key={h} className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.workspaces.map(w => (
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
            {data.workspaces.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No knowledge bases yet</div>}
          </div>
        </>
      )}
    </>
  );
}
