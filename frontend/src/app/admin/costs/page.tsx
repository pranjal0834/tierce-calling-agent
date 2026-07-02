"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, DollarSign, Phone, Zap, Activity, TrendingUp, Calculator, Database, AlertTriangle, Info } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import toast from "react-hot-toast";
import { adminGet, CostData, KpiStat, CardLabel, PageHeading } from "@/components/admin/ui";

interface CostPoint { date: string; cogs_inr: number; revenue_inr: number }

export default function AdminCostsPage() {
  const [costs, setCosts] = useState<CostData | null>(null);
  const [series, setSeries] = useState<CostPoint[]>([]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        adminGet(`/costs?days=${d}`),
        adminGet(`/trends?days=${d}`).catch(() => ({ series: [] })),
      ]);
      setCosts(c);
      setSeries(t?.series || []);
    }
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
          {(() => {
            const metrics: { label: string; value: string; icon: React.ElementType; tint: string; sub?: string }[] = [
              { label: "Total AI Cost", value: `$${costs.total_cost_usd.toFixed(2)}`, icon: DollarSign, tint: "bg-warning-50 text-warning-600", sub: `${costs.total_calls} calls · ${costs.total_minutes} min` },
              { label: "Realtime Audio", value: `$${costs.realtime_cost_usd.toFixed(2)}`, icon: Phone, tint: "bg-brand-50 text-brand-600", sub: costs.total_cost_usd > 0 ? `${Math.round(costs.realtime_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—" },
              { label: "Auxiliary AI", value: `$${costs.auxiliary_cost_usd.toFixed(2)}`, icon: Zap, tint: "bg-purple-50 text-purple-600", sub: costs.total_cost_usd > 0 ? `${Math.round(costs.auxiliary_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—" },
              { label: "KB Ingestion", value: `$${(costs.kb_ingestion_usd ?? 0).toFixed(4)}`, icon: Database, tint: "bg-teal-50 text-teal-600", sub: "one-time doc embedding" },
              { label: "Cost / Min", value: `$${costs.avg_cost_per_min_usd.toFixed(4)}`, icon: Activity, tint: "bg-cyan-50 text-cyan-600" },
              { label: "Cost / Call", value: `$${costs.avg_cost_per_call_usd.toFixed(4)}`, icon: TrendingUp, tint: "bg-pink-50 text-pink-600" },
              { label: "Gross Margin", value: `$${costs.gross_margin_usd.toFixed(2)}`, icon: DollarSign, tint: costs.gross_margin_usd >= 0 ? "bg-success-50 text-success-600" : "bg-error-50 text-error-600", sub: `rev ≈ $${costs.revenue_usd.toFixed(2)}` },
            ];
            return (
              <>
                {/* Tablet / desktop: card grid */}
                <div className="hidden sm:grid grid-cols-3 lg:grid-cols-7 gap-3">
                  {metrics.map(m => (
                    <KpiStat key={m.label} label={m.label} value={m.value} icon={m.icon} tint={m.tint} sub={m.sub} />
                  ))}
                </div>
                {/* Mobile: compact single-column scrollable list */}
                <div className="sm:hidden bg-white border border-neutral-200 rounded-xl shadow-xs divide-y divide-neutral-100 overflow-hidden">
                  {metrics.map(m => {
                    const Icon = m.icon;
                    return (
                      <div key={m.label} className="flex items-center gap-3 px-4 py-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.tint}`}>
                          <Icon className="icon-xs" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-neutral-600">{m.label}</p>
                          {m.sub && <p className="text-[11px] text-neutral-400 truncate">{m.sub}</p>}
                        </div>
                        <p className="text-base font-semibold text-neutral-900 shrink-0 tabular-nums">{m.value}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* H3 — negative gross-margin alert */}
          {costs.gross_margin_usd < 0 && (
            <div className="flex items-start gap-3 bg-error-50 border border-error-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-error-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-error-700">Gross margin is negative</p>
                <p className="text-xs text-error-600 mt-0.5">
                  AI cost (${(costs.total_cost_usd + (costs.kb_ingestion_usd ?? 0)).toFixed(2)}) exceeds revenue (${costs.revenue_usd.toFixed(2)}) over the last {costs.range_days} days — a ${Math.abs(costs.gross_margin_usd).toFixed(2)} loss.
                </p>
              </div>
            </div>
          )}

          {/* H1 — cost & revenue over time */}
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5">
            <CardLabel>Cost &amp; revenue over time (₹)</CardLabel>
            {series.length === 0 ? (
              <p className="text-sm text-neutral-500 py-6 text-center">No data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="cogs_inr" name="AI cost ₹" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="revenue_inr" name="Revenue ₹" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
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

            {/* H5 + H2 — per-workspace revenue vs cost (profitability), click to drill in */}
            <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5">
              <CardLabel>Workspace profitability</CardLabel>
              {costs.top_workspaces.length === 0 ? (
                <p className="text-sm text-neutral-500">No costed calls in this period.</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center text-[10px] font-semibold uppercase tracking-wide text-neutral-400 pb-1 border-b border-neutral-100">
                    <span className="flex-1">Workspace</span>
                    <span className="w-16 text-right">Revenue</span>
                    <span className="w-16 text-right">Cost</span>
                    <span className="w-20 text-right">Margin</span>
                  </div>
                  {costs.top_workspaces.map((w, i) => {
                    const rev = w.revenue_usd ?? 0;
                    const margin = w.margin_usd ?? (rev - w.cost_usd);
                    const loss = margin < 0;
                    return (
                      <div key={i} className="flex items-center text-xs py-0.5">
                        <Link href={`/admin/workspaces?search=${encodeURIComponent(w.workspace)}`}
                          className="flex-1 truncate text-neutral-700 hover:text-brand-600 hover:underline" title={`View ${w.workspace}`}>
                          {w.workspace}
                        </Link>
                        <span className="w-16 text-right text-neutral-500 tabular-nums">${rev.toFixed(2)}</span>
                        <span className="w-16 text-right text-neutral-500 tabular-nums">${w.cost_usd.toFixed(2)}</span>
                        <span className={`w-20 text-right font-medium tabular-nums ${loss ? "text-error-600" : "text-success-600"}`}>
                          {loss ? "−" : "+"}${Math.abs(margin).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-neutral-400 pt-1.5">Revenue = purchases in period · cost = AI COGS · <span className="text-error-600">red = loss-making</span>. Click a workspace for detail.</p>
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

  const Field = ({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) => (
    <div>
      <label htmlFor={htmlFor} className="text-xs text-neutral-500">{label}</label>
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
        <Field label="Number of calls" htmlFor="est-calls">
          <input id="est-calls" type="number" min={0} value={calls} onChange={e => setCalls(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Avg duration (min)" htmlFor="est-duration">
          <input id="est-duration" type="number" min={0} step={0.5} value={duration} onChange={e => setDuration(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Engine" htmlFor="est-engine">
          <select id="est-engine" value={engine} onChange={e => setEngine(e.target.value as "gemini" | "openai")} className={inputCls}>
            <option value="gemini">Gemini (default)</option>
            <option value="openai">OpenAI realtime</option>
          </select>
        </Field>
        <Field label="Your price /min (₹)" htmlFor="est-price">
          <input id="est-price" type="number" min={0} value={price} onChange={e => setPrice(Number(e.target.value))} className={inputCls} />
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
        <div className="rounded-lg bg-warning-50 border border-amber-200 p-3">
          <p className="text-[11px] text-warning-600">Total AI cost</p>
          <p className="text-lg font-semibold text-warning-700">{inr(totalCostInr)}</p>
          <p className="text-[10px] text-warning-600/80 mt-0.5">+18% GST → {inr(totalWithGstInr)}</p>
        </div>
        <div className={`rounded-lg border p-3 ${marginInr >= 0 ? "bg-success-50 border-emerald-200" : "bg-error-50 border-red-200"}`}>
          <p className={`text-[11px] ${marginInr >= 0 ? "text-success-600" : "text-error-600"}`}>Gross margin</p>
          <p className={`text-lg font-semibold ${marginInr >= 0 ? "text-success-700" : "text-error-700"}`}>
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

      {/* H4 — explain the formula & constants */}
      <details className="mt-3 group">
        <summary className="text-[11px] font-medium text-brand-600 cursor-pointer inline-flex items-center gap-1 select-none">
          <Info className="w-3 h-3" /> How this is calculated
        </summary>
        <div className="mt-2 text-[11px] text-neutral-500 leading-relaxed bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-1.5">
          <p className="font-mono text-neutral-700">cost/min ($) = (0.0181 + min(duration, 12) × 0.00147) × engine</p>
          <ul className="space-y-1 list-disc pl-4">
            <li><b>$0.0181/min</b> — base Gemini native-audio rate (audio in+out) for a short call.</li>
            <li><b>+$0.00147 per minute of duration</b> — the conversation context (system prompt + history) is re-sent every turn, so longer calls cost more per minute. Capped at 12 min.</li>
            <li><b>× engine</b> — <b>1.0</b> for Gemini, <b>2.3</b> for OpenAI Realtime (≈2.3× the token cost).</li>
            <li>Rates were calibrated <b>×1.131</b> to match Google's real invoiced cost (FX + effective pricing), then <b>+18% GST</b> is added for the credit-deducted total.</li>
          </ul>
          <p className="text-neutral-400">Telephony/number rental are excluded. Tune the base rates in <code className="font-mono">GEMINI_*_COST_PER_M</code> env vars.</p>
        </div>
      </details>
    </div>
  );
}
