"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, ArrowLeftRight, TrendingUp, Receipt } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, CardLabel, ExportButton, fmt } from "@/components/admin/ui";

interface Tx {
  id: string; workspace_name: string; type: string; minutes: number | null;
  amount_inr: number | null; balance_after: number | null; description: string | null;
  payment_provider: string | null; payment_id: string | null; created_at: string | null;
}
interface Resp {
  transactions: Tx[];
  summary: { total_revenue_inr: number; top_workspaces: { workspace: string; revenue_inr: number }[] };
}

const TYPE_TONE: Record<string, "emerald" | "blue" | "amber" | "neutral" | "red"> = {
  purchase: "emerald", free_trial: "blue", number_topup: "amber", deduction: "red",
};

export default function AdminTransactionsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try { setData(await adminGet(`/transactions?limit=200${query ? `&q=${encodeURIComponent(query)}` : ""}`)); }
    catch { toast.error("Failed to load transactions"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeading
        title="Transactions"
        subtitle="Payments, credits, and revenue across all workspaces"
        action={
          <div className="flex gap-2">
            {data && <ExportButton rows={data.transactions as unknown as Record<string, unknown>[]} filename="transactions" />}
            <button onClick={() => load(q)} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiStat label="Total Revenue" value={`₹${data.summary.total_revenue_inr.toLocaleString("en-IN")}`} icon={TrendingUp} tint="bg-emerald-50 text-emerald-600" sub="paid purchases" />
            <KpiStat label="Transactions" value={data.transactions.length} icon={Receipt} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Top Workspace" value={data.summary.top_workspaces[0]?.workspace ?? "—"} icon={ArrowLeftRight} tint="bg-blue-50 text-blue-600" sub={data.summary.top_workspaces[0] ? `₹${data.summary.top_workspaces[0].revenue_inr.toLocaleString("en-IN")}` : undefined} />
          </div>

          <form onSubmit={e => { e.preventDefault(); load(q); }} className="relative max-w-sm mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search workspace, type, description…"
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Transactions table */}
            <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                  <tr>{["Date", "Workspace", "Type", "Amount", "Min", "Note"].map(h => <th key={h} className="px-3 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.transactions.map(t => (
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
              {data.transactions.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No transactions found</div>}
            </div>

            {/* Revenue by workspace */}
            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5 h-fit">
              <CardLabel>Top workspaces by revenue</CardLabel>
              {data.summary.top_workspaces.length === 0 ? (
                <p className="text-sm text-neutral-500">No revenue yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {data.summary.top_workspaces.map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-neutral-700 truncate flex-1">{w.workspace}</span>
                      <span className="text-neutral-900 font-medium ml-3">₹{w.revenue_inr.toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-neutral-400">Refunds are issued via Razorpay directly; use <span className="font-medium">Workspaces → adjust credits</span> to reverse credited minutes.</p>
        </>
      )}
    </>
  );
}
