"use client";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, PieChart, Pie, Cell, Legend, Sector,
} from "recharts";
import {
  BarChart3, Bot, Clock, TrendingUp, Brain, Target,
  Zap, Download, RefreshCw, Phone, Calendar, X,
} from "lucide-react";
import { getAgents, getAgentAnalytics, getWorkspaceAnalytics } from "@/lib/api";
import { SkeletonKpis, SkeletonCard } from "@/components/ui/Skeleton";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnalyticsRange {
  preset: number | null;   // null when custom dates are active
  startDate: string;       // YYYY-MM-DD (empty when using preset)
  endDate: string;         // YYYY-MM-DD (empty when using preset)
}

interface DayPoint {
  day: string;
  count: number;
  avg_sentiment?: number;
  avg_duration?: number;
}

interface WorkspaceAnalytics {
  days: number;
  total_calls: number;
  active_agents: number;
  avg_duration_s: number;
  avg_sentiment_score: number;
  total_cost_usd: number;
  status_distribution: { status: string; count: number }[];
  direction_distribution: { direction: string; count: number }[];
  calls_per_day: DayPoint[];
  calls_by_agent: { agent_id: string; agent_name: string; count: number; avg_sentiment: number }[];
  calls_by_status_per_day: Record<string, any>[];
  all_statuses: string[];
  hourly_heatmap: { dow: number; hour: number; count: number }[];
  first_call_resolution: {
    single_call_contacts: number;
    multi_call_contacts: number;
    total_contacts: number;
    rate: number;
  };
}

interface AgentAnalytics {
  total_calls: number;
  avg_duration_s: number;
  avg_sentiment_score: number;
  avg_eval_score: number;
  cache_hit_rate: number;
  calls_per_day: DayPoint[];
  fine_tuning_runs: number;
  latest_model: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#0B8A8F", "#F4B63D", "#22C55E", "#F87171", "#8B5CF6", "#60A5FA", "#F97316", "#EC4899"];

const STATUS_COLORS: Record<string, string> = {
  completed:    "#22C55E",
  failed:       "#F87171",
  initiated:    "#A78BFA",
  running:      "#0B8A8F",
  in_progress:  "#F4B63D",
  not_answered: "#F97316",
  voicemail:    "#8B5CF6",
  cancelled:    "#64748B",
};

function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 7}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke={fill}
      strokeWidth={1}
    />
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: { background: "#1f2937", border: "1px solid #374151", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#9ca3af" },
  itemStyle: { color: "#f3f4f6" },
  cursor: { fill: "rgba(255,255,255,0.05)" },
};

function shortDay(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function sentimentLabel(s: number) {
  if (s >= 0.6) return { text: "Positive", color: "text-success-400" };
  if (s >= 0.3) return { text: "Neutral",  color: "text-yellow-400" };
  return { text: "Negative", color: "text-error-400" };
}

function exportCSV(data: DayPoint[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => (r as any)[k] ?? "").join(","))];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function periodLabel(range: AnalyticsRange): string {
  if (range.preset !== null) return `Last ${range.preset} days`;
  return `${range.startDate} – ${range.endDate}`;
}

// ── Shared components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-xs text-neutral-500 font-medium uppercase tracking-wide truncate">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.replace("text-", "bg-").replace("400", "400/10")}`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      </div>
      <p className="text-xl sm:text-[22px] font-semibold text-neutral-900 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, onExport, data }: {
  title: string; onExport?: () => void; data?: unknown[];
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {onExport && data && data.length > 0 && (
        <button onClick={onExport}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors px-2 py-1 rounded-lg hover:bg-neutral-100">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      )}
    </div>
  );
}

// ── Hourly heatmap ────────────────────────────────────────────────────────────

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = ["12a","1a","2a","3a","4a","5a","6a","7a","8a","9a","10a","11a","12p","1p","2p","3p","4p","5p","6p","7p","8p","9p","10p","11p"];

function HourlyHeatmap({ data }: { data: { dow: number; hour: number; count: number }[] }) {
  const map: Record<string, number> = {};
  let maxCount = 1;
  data.forEach(({ dow, hour, count }) => {
    map[`${dow}-${hour}`] = count;
    if (count > maxCount) maxCount = count;
  });
  function opacity(count: number) {
    if (!count) return 0.04;
    return 0.15 + (count / maxCount) * 0.85;
  }
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 520 }}>
        <div className="flex items-center mb-1 pl-10">
          {HOUR_LABELS.map((h, i) => (
            <div key={i} className="flex-1 text-center text-neutral-400 font-mono" style={{ fontSize: 9 }}>{i % 3 === 0 ? h : ""}</div>
          ))}
        </div>
        {DOW_LABELS.map((day, dow) => (
          <div key={dow} className="flex items-center mb-1">
            <div className="w-10 text-xs text-neutral-500 shrink-0">{day}</div>
            {Array.from({ length: 24 }, (_, hour) => {
              const count = map[`${dow}-${hour}`] || 0;
              return (
                <div
                  key={hour}
                  className="flex-1 rounded-sm mx-px"
                  style={{ height: 20, background: `rgba(99,102,241,${opacity(count)})` }}
                  title={`${day} ${HOUR_LABELS[hour]}: ${count} call${count !== 1 ? "s" : ""}`}
                />
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-3 pl-10">
          <span className="text-xs text-neutral-400">Less</span>
          {[0.04, 0.2, 0.4, 0.65, 0.9].map((o, i) => (
            <div key={i} className="w-4 h-4 rounded-sm" style={{ background: `rgba(99,102,241,${o})` }} />
          ))}
          <span className="text-xs text-neutral-400">More</span>
        </div>
      </div>
    </div>
  );
}

// ── Date range filter ─────────────────────────────────────────────────────────

function DateRangeFilter({ range, onChange }: { range: AnalyticsRange; onChange: (r: AnalyticsRange) => void }) {
  const today = new Date().toISOString().split("T")[0];
  const defaultStart = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [showPicker, setShowPicker] = useState(false);
  const [localStart, setLocalStart] = useState(range.startDate || defaultStart);
  const [localEnd, setLocalEnd] = useState(range.endDate || today);

  const isCustom = range.preset === null;
  const canApply = !!localStart && !!localEnd && localStart <= localEnd;

  function applyCustom() {
    if (!canApply) return;
    onChange({ preset: null, startDate: localStart, endDate: localEnd });
    setShowPicker(false);
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:flex-wrap lg:justify-end w-full lg:w-auto">
      {/* Preset pills */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 overflow-x-auto">
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => { onChange({ preset: d, startDate: "", endDate: "" }); setShowPicker(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
              !isCustom && range.preset === d ? "bg-brand-500 text-white" : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {d}d
          </button>
        ))}
        <button
          onClick={() => setShowPicker(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 whitespace-nowrap ${
            isCustom ? "bg-brand-500 text-white" : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          <Calendar className="w-3 h-3" />
          {isCustom ? `${range.startDate} – ${range.endDate}` : "Custom"}
        </button>
      </div>

      {/* Inline date picker — shown when Custom is clicked */}
      {showPicker && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white border border-neutral-300 rounded-xl px-3 py-2.5 sm:py-2 shadow-sm">
          <div className="flex items-center justify-between sm:justify-start gap-1.5">
            <span className="text-xs text-neutral-500 w-10 sm:w-auto">From</span>
            <input
              type="date"
              value={localStart}
              max={localEnd || today}
              onChange={e => setLocalStart(e.target.value)}
              className="flex-1 sm:flex-none bg-white border border-neutral-300 text-neutral-900 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-500"
            />
          </div>
          <span className="text-neutral-400 text-xs hidden sm:inline">→</span>
          <div className="flex items-center justify-between sm:justify-start gap-1.5">
            <span className="text-xs text-neutral-500 w-10 sm:w-auto">To</span>
            <input
              type="date"
              value={localEnd}
              min={localStart}
              max={today}
              onChange={e => setLocalEnd(e.target.value)}
              className="flex-1 sm:flex-none bg-white border border-neutral-300 text-neutral-900 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={applyCustom}
              disabled={!canApply}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Apply
            </button>
            <button onClick={() => setShowPicker(false)} className="text-neutral-400 hover:text-neutral-900 transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ range }: { range: AnalyticsRange }) {
  const [data, setData] = useState<WorkspaceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = range.preset !== null
        ? await getWorkspaceAnalytics(range.preset)
        : await getWorkspaceAnalytics(30, range.startDate, range.endDate);
      setData(d);
    } catch { /* no data yet */ }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="space-y-6">
      <SkeletonKpis count={4} />
      <SkeletonCard className="h-64" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-56" />
      </div>
    </div>
  );

  const period = periodLabel(range);

  if (!data || data.total_calls === 0) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 border border-dashed border-neutral-300 rounded-2xl">
      <BarChart3 className="w-10 h-10 text-neutral-300" />
      <p className="text-sm text-neutral-500">No calls for {period}</p>
      <p className="text-xs text-neutral-400">Make some calls to see analytics here.</p>
    </div>
  );

  const sl = sentimentLabel(data.avg_sentiment_score);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Total Calls"   value={data.total_calls}                     sub={period}                          icon={Phone}      color="text-info-400"   />
        <KpiCard label="Active Agents" value={data.active_agents}                   sub="in workspace"                    icon={Bot}        color="text-brand-400" />
        <KpiCard label="Avg Duration"  value={`${data.avg_duration_s.toFixed(0)}s`} sub={`${(data.avg_duration_s/60).toFixed(1)} min`} icon={Clock} color="text-success-400" />
        <KpiCard label="Avg Sentiment" value={`${(data.avg_sentiment_score * 100).toFixed(0)}%`} sub={sl.text} icon={TrendingUp} color={sl.color} />
      </div>

      {/* Calls per day */}
      {data.calls_per_day.length > 0 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader
            title="Calls over time"
            onExport={() => exportCSV(data.calls_per_day, `calls-trend.csv`)}
            data={data.calls_per_day}
          />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.calls_per_day.map(d => ({ ...d, day: shortDay(d.day) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, "Calls"]} />
              <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Call outcomes: donut + stacked bar */}
      {data.status_distribution.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
            <SectionHeader title="Call outcomes" />
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={data.status_distribution}
                    dataKey="count" nameKey="status"
                    cx="50%" cy="50%"
                    innerRadius={42} outerRadius={68}
                    paddingAngle={3}
                    activeShape={ActiveSlice}
                  >
                    {data.status_distribution.map(({ status }, i) => (
                      <Cell key={i} fill={STATUS_COLORS[status] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number, name: string) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2.5 flex-1">
                {data.status_distribution.sort((a, b) => b.count - a.count).map(({ status, count }, i) => {
                  const pct = Math.round((count / data.total_calls) * 100);
                  const color = STATUS_COLORS[status] || CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <div key={status} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-xs text-neutral-600 capitalize truncate">{status}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-semibold text-neutral-900">{count}</span>
                        <span className="text-xs text-neutral-400 ml-1">({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {data.calls_by_status_per_day.length > 0 && (
            <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
              <SectionHeader title="Outcomes over time" />
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.calls_by_status_per_day.map(d => ({ ...d, day: shortDay(d.day) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                  {data.all_statuses.map((status, i) => (
                    <Bar
                      key={status}
                      dataKey={status}
                      stackId="a"
                      fill={STATUS_COLORS[status] || CHART_COLORS[i % CHART_COLORS.length]}
                      radius={i === data.all_statuses.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Sentiment trend */}
      {data.calls_per_day.length > 1 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader title="Sentiment trend" />
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.calls_per_day.map(d => ({ ...d, day: shortDay(d.day), sentiment: +((d.avg_sentiment ?? 0) * 100).toFixed(1) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, "Avg Sentiment"]} />
              <Line type="monotone" dataKey="sentiment" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Calls by agent */}
      {data.calls_by_agent.length > 0 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader
            title="Calls by agent"
            onExport={() => exportCSV(data.calls_by_agent as any, `calls-by-agent.csv`)}
            data={data.calls_by_agent}
          />
          <ResponsiveContainer width="100%" height={Math.max(160, data.calls_by_agent.length * 42)}>
            <BarChart layout="vertical" data={data.calls_by_agent} margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="agent_name" tick={{ fill: "#d1d5db", fontSize: 12 }} width={110} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, "Calls"]} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.calls_by_agent.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Direction */}
      {data.direction_distribution.length > 0 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader title="Call direction" />
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={data.direction_distribution} dataKey="count" nameKey="direction"
                  cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {data.direction_distribution.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {data.direction_distribution.map(({ direction, count }, i) => (
                <div key={direction} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <div>
                    <p className="text-sm text-neutral-900 capitalize">{direction}</p>
                    <p className="text-xs text-neutral-500">{count} calls ({Math.round(count / data.total_calls * 100)}%)</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── HIGH VALUE CHARTS ── */}

      {/* Avg call duration over time */}
      {data.calls_per_day.some(d => d.avg_duration && d.avg_duration > 0) && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader
            title="Avg call duration over time"
            onExport={() => exportCSV(data.calls_per_day, `duration-trend.csv`)}
            data={data.calls_per_day}
          />
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={data.calls_per_day.map(d => ({
              day: shortDay(d.day),
              duration_s: Math.round(d.avg_duration ?? 0),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="s" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}s (${(v/60).toFixed(1)} min)`, "Avg Duration"]} />
              <Line type="monotone" dataKey="duration_s" stroke="#06b6d4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Call success rate % over time */}
      {data.calls_by_status_per_day.length > 1 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader title="Call success rate over time" />
          <p className="text-xs text-neutral-500 mb-4">% of calls that completed successfully</p>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={data.calls_by_status_per_day.map(d => {
              const completed = (d.completed || 0);
              const total = data.all_statuses.reduce((sum: number, s: string) => sum + (d[s] || 0), 0);
              return {
                day: shortDay(d.day),
                rate: total > 0 ? Math.round((completed / total) * 100) : 0,
              };
            })}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, "Success Rate"]} />
              <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }}
                activeDot={{ r: 5, fill: "#10b981" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hourly heatmap */}
      {data.hourly_heatmap.length > 0 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader title="Busiest call hours" />
          <p className="text-xs text-neutral-500 mb-4">When calls are made — darker means more calls at that hour</p>
          <HourlyHeatmap data={data.hourly_heatmap} />
        </div>
      )}

      {/* First call resolution */}
      {data.first_call_resolution.total_contacts > 0 && (
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
          <SectionHeader title="First call resolution" />
          <p className="text-xs text-neutral-500 mb-5">How many contacts needed only one call vs called back multiple times</p>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Resolved in 1 call", value: data.first_call_resolution.single_call_contacts },
                    { name: "Called back 2+ times", value: data.first_call_resolution.multi_call_contacts },
                  ]}
                  dataKey="value" nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={42} outerRadius={68}
                  paddingAngle={3}
                  activeShape={ActiveSlice}
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-success-500 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-neutral-900">Resolved in 1 call</p>
                    <p className="text-lg font-bold text-neutral-900">{data.first_call_resolution.single_call_contacts}</p>
                  </div>
                  <div className="h-1.5 bg-neutral-200 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-success-500 rounded-full" style={{ width: `${data.first_call_resolution.rate * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-neutral-900">Called back 2+ times</p>
                    <p className="text-lg font-bold text-neutral-900">{data.first_call_resolution.multi_call_contacts}</p>
                  </div>
                  <div className="h-1.5 bg-neutral-200 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(1 - data.first_call_resolution.rate) * 100}%` }} />
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-neutral-200">
                <p className="text-xs text-neutral-500">FCR rate</p>
                <p className="text-[22px] font-semibold text-neutral-900 tracking-tight mt-0.5">
                  {Math.round(data.first_call_resolution.rate * 100)}%
                  <span className="text-sm font-normal text-neutral-500 ml-2">of {data.first_call_resolution.total_contacts} contacts</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-agent tab ──────────────────────────────────────────────────────────────

function AgentTab({ range }: { range: AnalyticsRange }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<AgentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAgents().then((a: any[]) => {
      setAgents(a);
      if (a.length > 0) setSelectedId(a[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    const p = range.preset !== null
      ? getAgentAnalytics(selectedId, range.preset)
      : getAgentAnalytics(selectedId, 30, range.startDate, range.endDate);
    p.then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [selectedId, range]);

  const period = periodLabel(range);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="w-4 h-4 text-neutral-500 shrink-0" />
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        >
          {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}{a.is_personal ? " (Personal)" : ""}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-6">
          <SkeletonKpis count={6} />
          <SkeletonCard className="h-56" />
        </div>
      ) : !data || data.total_calls === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 border border-dashed border-neutral-300 rounded-2xl">
          <Phone className="w-10 h-10 text-neutral-300" />
          <p className="text-sm text-neutral-500">No calls for this agent for {period}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard label="Total Calls"    value={data.total_calls}                              sub={period}                    icon={Phone}      color="text-info-400"   />
            <KpiCard label="Avg Duration"   value={`${data.avg_duration_s.toFixed(0)}s`}           sub={`${(data.avg_duration_s/60).toFixed(1)} min`} icon={Clock} color="text-success-400"  />
            <KpiCard label="Quality Score"  value={`${data.avg_eval_score.toFixed(1)}/10`}         sub="auto-evaluated"            icon={Target}     color="text-yellow-400" />
            <KpiCard label="Avg Sentiment"  value={`${(data.avg_sentiment_score*100).toFixed(0)}%`} sub={sentimentLabel(data.avg_sentiment_score).text} icon={TrendingUp} color={sentimentLabel(data.avg_sentiment_score).color} />
            <KpiCard label="Cache Hit Rate" value={`${(data.cache_hit_rate*100).toFixed(1)}%`}     sub="prediction cache"          icon={Zap}        color="text-purple-400" />
            <KpiCard label="Fine-Tune Runs" value={data.fine_tuning_runs}                          sub={data.latest_model ? "Custom model active" : "Using base model"} icon={Brain} color="text-pink-400" />
          </div>

          {data.calls_per_day.length > 0 && (
            <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
              <SectionHeader
                title="Calls over time"
                onExport={() => exportCSV(data.calls_per_day, `agent-calls.csv`)}
                data={data.calls_per_day}
              />
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.calls_per_day.map(d => ({ ...d, day: shortDay(d.day) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [v, "Calls"]} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.calls_per_day.length > 1 && (
            <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
              <SectionHeader title="Sentiment trend" />
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data.calls_per_day.map(d => ({
                  day: shortDay(d.day),
                  sentiment: +((d.avg_sentiment ?? 0) * 100).toFixed(1),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, "Avg Sentiment"]} />
                  <Line type="monotone" dataKey="sentiment" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-neutral-900 mb-4">Self-Improving Feedback Loop</h3>
            <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
              {[
                { label: "Live Calls",      desc: `${data.total_calls} total`,                    color: "bg-info-50 text-info-700 border-blue-200"     },
                { label: "Auto Evaluation", desc: `${data.avg_eval_score.toFixed(1)}/10 avg`,      color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                { label: "Failure Mining",  desc: "Low-score turns",                              color: "bg-orange-50 text-orange-700 border-orange-200" },
                { label: "Fine-Tuning",     desc: `${data.fine_tuning_runs} runs`,                 color: "bg-purple-50 text-purple-700 border-purple-200" },
                { label: "Better Model",    desc: data.latest_model ? "Custom model" : "Pending",  color: "bg-success-50 text-success-700 border-green-200"   },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex flex-col sm:flex-1 sm:flex-row sm:items-stretch">
                  <div className={`flex-1 rounded-xl px-4 py-3 border ${step.color} text-center`}>
                    <p className="text-xs font-semibold">{step.label}</p>
                    <p className="text-xs opacity-70 mt-0.5">{step.desc}</p>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex items-center justify-center text-neutral-300 py-1 sm:py-0 sm:px-1">
                      <span className="rotate-90 sm:rotate-0 text-lg leading-none">→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"overview" | "agent">("overview");
  const [range, setRange] = useState<AnalyticsRange>({ preset: 30, startDate: "", endDate: "" });

  return (
    <div className="space-y-6">
      {/* Page actions */}
      <div className="flex justify-end">
        <DateRangeFilter range={range} onChange={setRange} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 pb-0 overflow-x-auto">
        {[
          { key: "overview", label: "Workspace Overview", icon: BarChart3 },
          { key: "agent",    label: "Per Agent",           icon: Bot },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0 ${
              tab === key
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <OverviewTab range={range} />}
      {tab === "agent"    && <AgentTab    range={range} />}
    </div>
  );
}
