"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, DollarSign, Phone, Zap, Activity, TrendingUp, Calculator, Database } from "lucide-react";
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <KpiStat label="Total AI Cost" value={`$${costs.total_cost_usd.toFixed(2)}`} icon={DollarSign} tint="bg-amber-50 text-amber-600" sub={`${costs.total_calls} calls · ${costs.total_minutes} min`} />
            <KpiStat label="Realtime Audio" value={`$${costs.realtime_cost_usd.toFixed(2)}`} icon={Phone} tint="bg-brand-50 text-brand-600" sub={costs.total_cost_usd > 0 ? `${Math.round(costs.realtime_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—"} />
            <KpiStat label="Auxiliary AI" value={`$${costs.auxiliary_cost_usd.toFixed(2)}`} icon={Zap} tint="bg-purple-50 text-purple-600" sub={costs.total_cost_usd > 0 ? `${Math.round(costs.auxiliary_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—"} />
            <KpiStat label="KB Ingestion" value={`$${(costs.kb_ingestion_usd ?? 0).toFixed(4)}`} icon={Database} tint="bg-teal-50 text-teal-600" sub="one-time doc embedding" />
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

      <CostEstimator usdToInr={costs?.usd_to_inr ?? 95.61} />
    </>
  );
}

// ── AI Cost Estimator ─────────────────────────────────────────────────────────
// Projects AI-only cost (Gemini default) for a campaign. Grounded in metered calls:
// ~$0.016/min on a short call → ~$0.029/min on a 10-min call (per-turn context tokens
// re-sent each turn). Telephony is excluded; number rental is a separate ₹300/mo charge.
function CostEstimator({ usdToInr }: { usdToInr: number }) {
  const [calls, setCalls] = useState(1000);
  const [duration, setDuration] = useState(3);
  const [engine, setEngine] = useState<"gemini" | "openai">("gemini");
  const [price, setPrice] = useState(10);

  const GST_PCT = 18;
  const mult = engine === "openai" ? 2.3 : 1.0;
  // Constants calibrated 2026-06-29 to Google's actual billed cost (×1.131 vs raw token rates).
  const costPerMinUsd = (0.0181 + Math.min(Math.max(duration, 0), 12) * 0.00147) * mult;
  const costPerMinInr = costPerMinUsd * usdToInr;
  const costPerCallInr = costPerMinInr * Math.max(duration, 0);
  const totalCostInr = costPerCallInr * Math.max(calls, 0);
  const totalWithGstInr = totalCostInr * (1 + GST_PCT / 100);   // what's actually deducted from Google credits
  const revenueInr = Math.max(price, 0) * Math.max(duration, 0) * Math.max(calls, 0);
  const marginInr = revenueInr - totalWithGstInr;
  const marginPct = revenueInr > 0 ? (marginInr / revenueInr) * 100 : 0;

  const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="text-xs text-neutral-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm focus:outline-none focus:border-brand-400";

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-brand-500" />
        <CardLabel>AI cost estimator</CardLabel>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        AI model cost only (telephony excluded; number rental ₹300/mo is separate). Based on metered Gemini calls.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Field label="Number of calls">
          <input type="number" min={0} value={calls} onChange={e => setCalls(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Avg duration (min)">
          <input type="number" min={0} step={0.5} value={duration} onChange={e => setDuration(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Engine">
          <select value={engine} onChange={e => setEngine(e.target.value as "gemini" | "openai")} className={inputCls}>
            <option value="gemini">Gemini (default)</option>
            <option value="openai">OpenAI realtime</option>
          </select>
        </Field>
        <Field label="Your price /min (₹)">
          <input type="number" min={0} value={price} onChange={e => setPrice(Number(e.target.value))} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
          <p className="text-[11px] text-neutral-500">Cost / min</p>
          <p className="text-lg font-semibold text-neutral-900">{costPerMinInr.toFixed(2)}<span className="text-xs text-neutral-400"> ₹</span></p>
        </div>
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
          <p className="text-[11px] text-neutral-500">Cost / call</p>
          <p className="text-lg font-semibold text-neutral-900">₹{costPerCallInr.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-[11px] text-amber-600">Total AI cost</p>
          <p className="text-lg font-semibold text-amber-700">{inr(totalCostInr)}</p>
          <p className="text-[10px] text-amber-600/80 mt-0.5">+18% GST → {inr(totalWithGstInr)}</p>
        </div>
        <div className={`rounded-lg border p-3 ${marginInr >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
          <p className={`text-[11px] ${marginInr >= 0 ? "text-emerald-600" : "text-red-600"}`}>Gross margin</p>
          <p className={`text-lg font-semibold ${marginInr >= 0 ? "text-emerald-700" : "text-red-700"}`}>
            {inr(marginInr)} <span className="text-xs font-normal">({Math.round(marginPct)}%)</span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[100, 1000, 10000].map(n => (
          <div key={n} className="rounded-lg border border-neutral-200 p-2.5">
            <p className="text-[11px] text-neutral-500">{n.toLocaleString("en-IN")} calls</p>
            <p className="text-sm font-semibold text-neutral-900">{inr(costPerCallInr * n)}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">
        Revenue ≈ {inr(revenueInr)} ({calls.toLocaleString("en-IN")} calls × {duration} min × ₹{price}/min).
        Cost calibrated to Google's actual billing; margin is computed on the GST-inclusive cost.
        {engine === "openai" && " OpenAI realtime ≈ 2.3× Gemini cost."}
      </p>
    </div>
  );
}
