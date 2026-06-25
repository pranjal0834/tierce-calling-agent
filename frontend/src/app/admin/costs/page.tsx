"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, DollarSign, Phone, Zap, Activity, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, CostData, KpiStat, CardLabel, PageHeading } from "@/components/admin/ui";

export default function AdminCostsPage() {
  const [costs, setCosts] = useState<CostData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try { setCosts(await adminGet(`/costs?days=${d}`)); }
    catch { toast.error("Failed to load cost analytics"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  return (
    <>
      <PageHeading title="Cost Analytics" subtitle="AI cost of goods sold — internal only, never shown to tenants" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-500">Period:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${days === d ? "bg-brand-50 text-brand-600 border-brand-200" : "text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}>
            Last {d} days
          </button>
        ))}
        {costs && (
          <span className="ml-auto text-xs text-neutral-500 bg-neutral-100 rounded-lg px-2.5 py-1">
            Rate: <span className="font-medium text-neutral-700">$1 = ₹{costs.usd_to_inr.toFixed(2)}</span>
          </span>
        )}
      </div>

      {loading || !costs ? (
        <div className="flex justify-center py-20"><RefreshCw className="w-5 h-5 text-neutral-400 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiStat label="Total AI Cost" value={`$${costs.total_cost_usd.toFixed(2)}`} icon={DollarSign} tint="bg-amber-50 text-amber-600" sub={`${costs.total_calls} calls · ${costs.total_minutes} min`} />
            <KpiStat label="Realtime Audio" value={`$${costs.realtime_cost_usd.toFixed(2)}`} icon={Phone} tint="bg-brand-50 text-brand-600" sub={costs.total_cost_usd > 0 ? `${Math.round(costs.realtime_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—"} />
            <KpiStat label="Auxiliary AI" value={`$${costs.auxiliary_cost_usd.toFixed(2)}`} icon={Zap} tint="bg-purple-50 text-purple-600" sub={costs.total_cost_usd > 0 ? `${Math.round(costs.auxiliary_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—"} />
            <KpiStat label="Cost / Min" value={`$${costs.avg_cost_per_min_usd.toFixed(4)}`} icon={Activity} tint="bg-cyan-50 text-cyan-600" />
            <KpiStat label="Cost / Call" value={`$${costs.avg_cost_per_call_usd.toFixed(4)}`} icon={TrendingUp} tint="bg-pink-50 text-pink-600" />
            <KpiStat label="Gross Margin" value={`$${costs.gross_margin_usd.toFixed(2)}`} icon={DollarSign} tint={costs.gross_margin_usd >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"} sub={`rev ≈ $${costs.revenue_usd.toFixed(2)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5">
              <CardLabel>Auxiliary cost by component</CardLabel>
              {costs.auxiliary_components.length === 0 ? (
                <p className="text-sm text-neutral-500">No auxiliary costs recorded in this period.</p>
              ) : (
                <div className="space-y-3">
                  {costs.auxiliary_components.map(c => {
                    const pct = costs.auxiliary_cost_usd > 0 ? (c.usd / costs.auxiliary_cost_usd * 100) : 0;
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-700">{c.name.replace(/_/g, " ")}</span>
                          <span className="text-neutral-500">${c.usd.toFixed(4)} <span className="text-neutral-400">({c.calls} calls)</span></span>
                        </div>
                        <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-400 rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5">
              <CardLabel>Top workspaces by AI cost</CardLabel>
              {costs.top_workspaces.length === 0 ? (
                <p className="text-sm text-neutral-500">No costed calls in this period.</p>
              ) : (
                <div className="space-y-2.5">
                  {costs.top_workspaces.map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-700 truncate flex-1">{w.workspace}</span>
                      <span className="text-neutral-400 mx-3">{w.calls} calls</span>
                      <span className="text-neutral-900 font-medium">${w.cost_usd.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
