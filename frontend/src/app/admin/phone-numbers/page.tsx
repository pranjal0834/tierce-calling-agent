"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, Hash, Phone, Wallet, AlertTriangle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";

interface NumRow {
  id: string; phone_number: string; workspace_name: string; provider: string;
  is_active: boolean; is_suspended: boolean; auto_renew: boolean;
  monthly_cost_inr: number; purchased_at: string | null; renews_at: string | null;
}
interface Resp {
  numbers: NumRow[];
  summary: { total: number; active: number; suspended: number; number_price_inr: number; monthly_liability_inr: number };
}

export default function AdminPhoneNumbersPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminGet("/phone-numbers")); }
    catch { toast.error("Failed to load phone numbers"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nums = data?.numbers ?? [];
    if (!q) return nums;
    return nums.filter(n => n.phone_number.toLowerCase().includes(q) || n.workspace_name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <>
      <PageHeading
        title="Phone Numbers"
        subtitle="Every purchased number across all workspaces — and your monthly cost liability"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiStat label="Total Numbers" value={data.summary.total} icon={Hash} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Active" value={data.summary.active} icon={CheckCircle2} tint="bg-success-50 text-success-600" />
            <KpiStat label="Suspended" value={data.summary.suspended} icon={AlertTriangle} tint="bg-error-50 text-error-600" />
            <KpiStat label="Monthly Liability" value={`₹${data.summary.monthly_liability_inr.toLocaleString("en-IN")}`} icon={Wallet} tint="bg-amber-50 text-amber-600" sub={`₹${data.summary.number_price_inr}/number`} />
          </div>

          <div className="relative max-w-sm mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search number or workspace…"
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>
                  {["Number", "Workspace", "Provider", "Status", "Renews", "Monthly"].map(h =>
                    <th key={h} className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(n => (
                  <tr key={n.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">{n.phone_number}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{n.workspace_name}</td>
                    <td className="px-4 py-2.5 text-neutral-500 capitalize">{n.provider}</td>
                    <td className="px-4 py-2.5">
                      {n.is_suspended ? <Pill tone="red">Suspended</Pill> : n.is_active ? <Pill tone="emerald">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}
                      {!n.auto_renew && <span className="ml-1.5 text-[11px] text-neutral-400">no auto-renew</span>}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{n.renews_at ? fmt(n.renews_at) : "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-700">₹{n.monthly_cost_inr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Phone className="w-7 h-7 text-neutral-300" />
                <p className="text-sm font-medium text-neutral-500">No numbers found</p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
