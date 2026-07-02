"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, ArrowLeftRight, TrendingUp, Receipt, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, CardLabel, ExportButton, fmt } from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface Tx {
  id: string; workspace_name: string; type: string; minutes: number | null;
  amount_inr: number | null; balance_after: number | null; description: string | null;
  payment_provider: string | null; payment_id: string | null; created_at: string | null;
}

const TYPE_TONE: Record<string, "emerald" | "blue" | "amber" | "neutral" | "red"> = {
  purchase: "emerald", free_trial: "blue", number_topup: "amber", deduction: "red",
};

export default function AdminTransactionsPage() {
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await adminGet("/transactions", {
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
      toast.error("Failed to load transactions");
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

  const summary = useMemo(() => {
    const totalRev = rows.reduce((s, t) => s + (t.amount_inr ?? 0), 0);
    const byWs: Record<string, number> = {};
    for (const t of rows) { if (t.type === "purchase" && t.amount_inr) { byWs[t.workspace_name] = (byWs[t.workspace_name] || 0) + t.amount_inr; } }
    const top = Object.entries(byWs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([workspace, revenue_inr]) => ({ workspace, revenue_inr }));
    return { total_revenue_inr: totalRev, top_workspaces: top };
  }, [rows]);

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
        title="Transactions"
        subtitle="Payments, credits, and revenue across all workspaces"
        action={
          <div className="flex gap-2">
            {rows.length > 0 && <ExportButton rows={rows as unknown as Record<string, unknown>[]} filename="transactions" />}
            <button onClick={() => load()} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiStat label="Total Revenue" value={`₹${summary.total_revenue_inr.toLocaleString("en-IN")}`} icon={TrendingUp} tint="bg-emerald-50 text-emerald-600" sub="paid purchases" />
            <KpiStat label="Transactions" value={total} icon={Receipt} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Top Workspace" value={summary.top_workspaces[0]?.workspace ?? "—"} icon={ArrowLeftRight} tint="bg-blue-50 text-blue-600" sub={summary.top_workspaces[0] ? `₹${summary.top_workspaces[0].revenue_inr.toLocaleString("en-IN")}` : undefined} />
          </div>

          <div className="relative max-w-sm mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search workspace, type, description…"
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Date" field="created_at" /></th>
                    <th className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Workspace" field="workspace_name" /></th>
                    <th className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Type" field="type" /></th>
                    <th className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Amount" field="amount_inr" /></th>
                    <th className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Min" field="minutes" /></th>
                    <th className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Note" field="description" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map(t => (
                    <tr key={t.id} className="hover:bg-neutral-50/60">
                      <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{t.created_at ? fmt(t.created_at) : "—"}</td>
                      <td className="px-3 py-2.5 text-neutral-700">{t.workspace_name}</td>
                      <td className="px-3 py-2.5"><Pill tone={TYPE_TONE[t.type] ?? "neutral"}>{t.type.replace(/_/g, " ")}</Pill></td>
                      <td className="px-3 py-2.5 text-neutral-900 font-medium whitespace-nowrap">{t.amount_inr != null ? `₹${t.amount_inr.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-3 py-2.5 text-neutral-500">{t.minutes != null ? t.minutes : "—"}</td>
                      <td className="px-3 py-2.5 text-neutral-400 max-w-[220px] truncate" title={t.description ?? ""}>{t.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No transactions found</div>}
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5 h-fit">
              <CardLabel>Top workspaces by revenue</CardLabel>
              {summary.top_workspaces.length === 0 ? (
                <p className="text-sm text-neutral-500">No revenue yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {summary.top_workspaces.map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-700 truncate flex-1">{w.workspace}</span>
                      <span className="text-neutral-900 font-medium ml-3">₹{w.revenue_inr.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

          <p className="text-xs text-neutral-400">Refunds are issued via Razorpay directly; use <span className="font-medium">Workspaces → adjust credits</span> to reverse credited minutes.</p>
        </>
      )}
    </>
  );
}
