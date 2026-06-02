"use client";
import { useEffect, useState } from "react";
import {
  Phone, Bot, Brain, Zap, TrendingUp, Activity,
  AlertCircle, ArrowRight, CreditCard, ArrowUpRight, CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { getAgents, getCalls, getBillingBalance } from "@/lib/api";
import toast from "react-hot-toast";

const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  completed:    { label: "Completed",    dot: "bg-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50" },
  in_progress:  { label: "Live",         dot: "bg-brand-400 animate-pulse", text: "text-brand-700", bg: "bg-brand-50" },
  ringing:      { label: "Ringing",      dot: "bg-amber-400 animate-pulse", text: "text-amber-700", bg: "bg-amber-50" },
  initiated:    { label: "Initiated",    dot: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
  not_answered: { label: "No Answer",    dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" },
  failed:       { label: "Failed",       dot: "bg-red-400", text: "text-red-700", bg: "bg-red-50" },
  voicemail:    { label: "Voicemail",    dot: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
  cancelled:    { label: "Cancelled",    dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" },
};

function toUTC(iso: string) {
  if (!iso) return iso;
  return iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
}

// Build last-7-days buckets from real call data
function last7Days(calls: any[]) {
  const days: { key: string; label: string; count: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({
      key: d.toISOString().split("T")[0],
      label: d.toLocaleDateString("en-US", { weekday: "short" }).charAt(0),
      count: 0,
    });
  }
  calls.forEach((c) => {
    if (!c.created_at) return;
    const key = new Date(toUTC(c.created_at)).toISOString().split("T")[0];
    const bucket = days.find((x) => x.key === key);
    if (bucket) bucket.count++;
  });
  return days;
}

// ── Enhanced stat card ──────────────────────────────────────────────────────
type Accent = { rail: string; chip: string };
const ACCENTS: Record<string, Accent> = {
  brand:   { rail: "bg-brand-500",   chip: "from-brand-400 to-brand-600"     },
  emerald: { rail: "bg-emerald-500", chip: "from-emerald-400 to-emerald-600" },
  amber:   { rail: "bg-amber-500",   chip: "from-amber-400 to-amber-500"     },
  violet:  { rail: "bg-violet-500",  chip: "from-violet-400 to-violet-600"   },
};

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="relative bg-white rounded-xl border border-neutral-200 shadow-card p-5 overflow-hidden hover:shadow-hover hover:-translate-y-0.5 transition-all duration-200">
      <div className={`absolute inset-x-0 top-0 h-1 ${a.rail} opacity-80`} />
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-neutral-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${a.chip} shadow-xs`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-neutral-900 leading-none tracking-tight">{value}</div>
      {sub && <p className="text-xs text-neutral-400 mt-1.5 truncate">{sub}</p>}
    </div>
  );
}

// ── 7-day activity bar chart (real data, dependency-free) ───────────────────
function ActivityChart({ days }: { days: { label: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="flex items-end justify-between gap-1.5 sm:gap-2 h-28">
      {days.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
          <div className="w-full flex items-end justify-center h-full">
            <div
              className="w-full max-w-[26px] rounded-t-md bg-gradient-to-t from-brand-500/60 to-brand-400 hover:from-brand-500 hover:to-brand-400 transition-all duration-200"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? "6px" : "3px", opacity: d.count > 0 ? 1 : 0.3 }}
              title={`${d.count} call${d.count !== 1 ? "s" : ""}`}
            />
          </div>
          <span className="text-[10px] text-neutral-400 font-medium">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Loading skeleton ─────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 skeleton rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 skeleton rounded-xl" />)}
      </div>
      <div className="h-44 skeleton rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-64 skeleton rounded-xl" />
        <div className="lg:col-span-2 h-64 skeleton rounded-xl" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [calls,  setCalls]  = useState<any[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAgents(), getCalls(), getBillingBalance()])
      .then(([a, c, bal]) => {
        setAgents(a);
        setCalls(c);
        setBalance(bal.credits_balance);
      })
      .catch((err: any) => {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail;
        if (status === 401)       setApiError("Not authenticated — please sign in again.");
        else if (status === 403)  setApiError("Workspace not found. Your account may need to be re-registered.");
        else                      setApiError(detail || "Could not reach the API. Make sure the backend is running.");
        toast.error("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  const recentCalls  = calls.slice(0, 6);
  const activeCalls  = calls.filter((c: any) => c.status === "in_progress");
  const nativeAgents = agents.filter((a: any) => a.pipeline_mode === "native").length;
  const classicAgents = agents.length - nativeAgents;
  const completedCalls = calls.filter((c: any) => c.status === "completed").length;
  const completedRate = calls.length > 0 ? Math.round((completedCalls / calls.length) * 100) : 0;

  // Real derived metrics
  const todayKey = new Date().toISOString().split("T")[0];
  const todayCount = calls.filter((c: any) =>
    c.created_at && new Date(toUTC(c.created_at)).toISOString().split("T")[0] === todayKey
  ).length;
  const days = last7Days(calls);
  const weekTotal = days.reduce((s, d) => s + d.count, 0);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Real-time overview of your voice agent platform</p>
        </div>

        {/* Balance chip */}
        <Link
          href="/billing"
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-150 shadow-xs hover:shadow-sm flex-shrink-0 ${
            balance === null   ? "bg-white border-neutral-200"
            : balance <= 0    ? "bg-red-50 border-red-200 hover:border-red-300"
            : balance <= 5    ? "bg-amber-50 border-amber-200 hover:border-amber-300"
            : "bg-brand-50 border-brand-200 hover:border-brand-300"
          }`}
        >
          <CreditCard className={`w-4 h-4 ${
            balance === null ? "text-neutral-400"
            : balance <= 0  ? "text-red-500"
            : balance <= 5  ? "text-amber-500"
            : "text-brand-500"
          }`} />
          <div>
            <p className={`text-sm font-semibold leading-tight ${
              balance === null ? "text-neutral-500"
              : balance <= 0  ? "text-red-600"
              : balance <= 5  ? "text-amber-600"
              : "text-neutral-900"
            }`}>
              {balance === null ? "—" : `${balance.toFixed(1)} min`}
            </p>
            <p className="text-[10px] text-neutral-400 leading-tight">
              {balance !== null && balance <= 0 ? "Top up now" : "Credits"}
            </p>
          </div>
        </Link>
      </div>

      {/* API error */}
      {apiError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">Unable to load data</p>
            <p className="text-sm text-red-600 mt-0.5">{apiError}</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Agents" value={agents.length} icon={Bot} accent="brand"
          sub={agents.length > 0 ? `${nativeAgents} native · ${classicAgents} classic` : "No agents yet"}
        />
        <StatCard
          label="Total Calls" value={calls.length} icon={Phone} accent="emerald"
          sub={`${todayCount} today`}
        />
        <StatCard
          label="Active Now" value={activeCalls.length} icon={Activity} accent="amber"
          sub={activeCalls.length > 0 ? "Live calls in progress" : "No live calls"}
        />
        <StatCard
          label="Completed" value={completedCalls} icon={CheckCircle2} accent="violet"
          sub={calls.length > 0 ? `${completedRate}% success rate` : "—"}
        />
      </div>

      {/* Empty onboarding state */}
      {!apiError && agents.length === 0 && (
        <div className="relative bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-brand">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-base font-semibold text-neutral-900 mb-2">Create your first agent</h2>
            <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-6 leading-relaxed">
              Set up a voice AI agent with a system prompt, voice, and language. Once created, you can make your first call in seconds.
            </p>
            <Link
              href="/agents"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
            >
              Go to Agents <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Call activity — real 7-day chart */}
      {calls.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-neutral-900">Call Activity</h2>
              <p className="text-xs text-neutral-400 mt-0.5">Last 7 days</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-neutral-900 leading-none">{weekTotal}</p>
              <p className="text-[10px] text-neutral-400 mt-1">calls this week</p>
            </div>
          </div>
          <ActivityChart days={days} />
        </div>
      )}

      {/* Two-column: feature highlights + recent calls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Feature highlights — 1 col */}
        <div className="space-y-3">
          {[
            {
              icon: Zap, iconCls: "from-violet-400 to-violet-600",
              title: "Native Audio",
              desc: "GPT-4o Realtime API — raw audio in/out. No STT/TTS latency.",
              badge: "~300ms faster",
            },
            {
              icon: Brain, iconCls: "from-pink-400 to-pink-600",
              title: "Emotional Intelligence",
              desc: "Pitch, energy & sentiment fused — agent adapts in real-time.",
              badge: "Live",
            },
            {
              icon: TrendingUp, iconCls: "from-emerald-400 to-emerald-600",
              title: "Self-Improving Loop",
              desc: "Every 50 calls triggers a fine-tuning run automatically.",
              badge: "Auto",
            },
          ].map(({ icon: Icon, iconCls, title, desc, badge }) => (
            <div key={title} className="bg-white rounded-xl border border-neutral-200 shadow-card p-4 flex items-start gap-3 hover:shadow-hover hover:-translate-y-0.5 transition-all duration-200">
              <div className={`w-9 h-9 bg-gradient-to-br ${iconCls} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-semibold text-neutral-900">{title}</span>
                  <span className="text-[10px] font-medium bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded-full">{badge}</span>
                </div>
                <p className="text-xs text-neutral-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Recent calls — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 shadow-card flex flex-col">
          <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-neutral-900">Recent Calls</h2>
            {calls.length > 0 && (
              <Link href="/calls" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            )}
          </div>

          {recentCalls.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center mb-3">
                <Phone className="w-5 h-5 text-neutral-400" />
              </div>
              <p className="text-sm font-medium text-neutral-600">No calls yet</p>
              <p className="text-xs text-neutral-400 mt-1 mb-4">Your call history will appear here once you start making calls.</p>
              {agents.length > 0 && (
                <Link href="/calls" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                  Make your first call <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          ) : (
            <div className="flex-1 divide-y divide-neutral-50">
              {recentCalls.map((call: any) => {
                const s = STATUS_MAP[call.status] ?? { label: call.status, dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" };
                return (
                  <div key={call.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-neutral-50/60 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{call.phone_number}</p>
                      <p className="text-xs text-neutral-400 mt-0.5 truncate">
                        {call.pipeline_mode} pipeline · {call.direction}
                        {call.duration_seconds ? ` · ${call.duration_seconds}s` : ""}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${s.bg} ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
