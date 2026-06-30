"use client";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { adminGet, CardLabel } from "@/components/admin/ui";

interface Point { date: string; calls: number; cogs_inr: number; revenue_inr: number }

export default function TrendCharts() {
  const [series, setSeries] = useState<Point[]>([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    adminGet(`/trends?days=${days}`).then(d => setSeries(d.series || [])).catch(() => {});
  }, [days]);

  const label = (d: string) => d.slice(5); // MM-DD
  const totalRev = series.reduce((s, p) => s + p.revenue_inr, 0);
  const totalCogs = series.reduce((s, p) => s + p.cogs_inr, 0);
  const totalCalls = series.reduce((s, p) => s + p.calls, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CardLabel>Trends — last {days} days</CardLabel>
        <div className="flex gap-1.5">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 h-7 rounded-lg text-xs font-medium border transition-colors ${days === d ? "bg-brand-50 text-brand-600 border-brand-200" : "text-neutral-500 border-neutral-200 hover:bg-neutral-50"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue vs COGS */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-sm font-medium text-neutral-700">Revenue vs COGS (₹)</p>
            <p className="text-xs text-neutral-400">rev ₹{Math.round(totalRev).toLocaleString("en-IN")} · cost ₹{Math.round(totalCogs).toLocaleString("en-IN")}</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="cogs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={label} tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="revenue_inr" name="Revenue ₹" stroke="#10b981" fill="url(#rev)" strokeWidth={2} />
              <Area type="monotone" dataKey="cogs_inr" name="COGS ₹" stroke="#f59e0b" fill="url(#cogs)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Calls per day */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-sm font-medium text-neutral-700">Calls per day</p>
            <p className="text-xs text-neutral-400">{totalCalls.toLocaleString("en-IN")} total</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tickFormatter={label} tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="calls" name="Calls" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
