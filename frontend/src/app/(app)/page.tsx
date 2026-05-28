"use client";
import { useEffect, useState } from "react";
import { Phone, Bot, Brain, Zap, TrendingUp, Activity, AlertCircle, ArrowRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { getAgents, getCalls, getBillingBalance } from "@/lib/api";
import toast from "react-hot-toast";

const STATUS_MAP: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  completed:    { label: "Completed",    cls: "text-green-600 bg-green-50 border-green-200" },
  in_progress:  { label: "Live",         cls: "text-brand-600 bg-brand-50 border-brand-200", pulse: true },
  ringing:      { label: "Ringing",      cls: "text-yellow-600 bg-yellow-50 border-yellow-200", pulse: true },
  initiated:    { label: "Initiated",    cls: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  not_answered: { label: "Not Answered", cls: "text-neutral-500 bg-neutral-100 border-neutral-200" },
  failed:       { label: "Failed",       cls: "text-red-600 bg-red-50 border-red-200" },
  voicemail:    { label: "Voicemail",    cls: "text-orange-600 bg-orange-50 border-orange-200" },
  cancelled:    { label: "Cancelled",    cls: "text-neutral-500 bg-neutral-100 border-neutral-200" },
};

export default function Dashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
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
        if (status === 401) {
          setApiError("Not authenticated — please sign in again.");
        } else if (status === 403) {
          setApiError("Workspace not found. Your account may need to be re-registered.");
        } else {
          setApiError(detail || "Could not reach the API. Make sure the backend is running.");
        }
        toast.error("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  const recentCalls = calls.slice(0, 5);
  const activeCalls = calls.filter((c: any) => c.status === "in_progress");

  const stats = [
    { label: "Total Agents",  value: agents.length,      icon: Bot,      color: "text-brand-500",   bg: "bg-brand-50" },
    { label: "Total Calls",   value: calls.length,        icon: Phone,    color: "text-green-600",   bg: "bg-green-50" },
    { label: "Active Calls",  value: activeCalls.length,  icon: Activity, color: "text-amber-600",   bg: "bg-amber-50" },
    { label: "Native Audio",  value: `${agents.filter((a: any) => a.pipeline_mode === "native").length} agents`, icon: Zap, color: "text-violet-600", bg: "bg-violet-50" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="text-neutral-500 mt-1">Real-time overview of your voice agent platform</p>
        </div>

        {/* Balance chip */}
        <Link
          href="/billing"
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors flex-shrink-0 ${
            balance === null
              ? "bg-white border-neutral-200 shadow-sm"
              : balance <= 0
              ? "bg-red-50 border-red-200 hover:border-red-300"
              : balance <= 5
              ? "bg-amber-50 border-amber-200 hover:border-amber-300"
              : "bg-brand-50 border-brand-200 hover:border-brand-300"
          }`}
        >
          <CreditCard className={`w-4 h-4 ${
            balance === null ? "text-neutral-400" :
            balance <= 0 ? "text-red-500" :
            balance <= 5 ? "text-amber-500" : "text-brand-500"
          }`} />
          <div className="text-right">
            <p className={`text-sm font-semibold leading-tight ${
              balance === null ? "text-neutral-500" :
              balance <= 0 ? "text-red-600" :
              balance <= 5 ? "text-amber-600" : "text-neutral-900"
            }`}>
              {balance === null ? "—" : `${balance.toFixed(1)} min`}
            </p>
            <p className="text-xs text-neutral-500 leading-tight">
              {balance !== null && balance <= 0 ? "Top up now" : "Credits"}
            </p>
          </div>
        </Link>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">Unable to load data</p>
            <p className="text-sm text-red-600 mt-0.5">{apiError}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-neutral-500">{label}</span>
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Empty state CTA */}
      {!apiError && agents.length === 0 && (
        <div className="bg-white border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">Create your first agent</h2>
          <p className="text-sm text-neutral-500 mb-6 max-w-md mx-auto">
            Set up a voice AI agent with a system prompt, voice, and language. Once created, you can make your first call in seconds.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Go to Agents <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Feature highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          {
            icon: Zap,
            iconCls: "text-violet-600",
            bg: "bg-violet-50",
            title: "Native Audio Pipeline",
            desc: "GPT-4o Realtime API — raw audio in, raw audio out. No STT or TTS latency.",
            badge: "~300ms faster",
          },
          {
            icon: Brain,
            iconCls: "text-pink-600",
            bg: "bg-pink-50",
            title: "Emotional Intelligence",
            desc: "Pitch, energy, pace analysis fused with sentiment — agent adapts in real-time.",
            badge: "Live",
          },
          {
            icon: TrendingUp,
            iconCls: "text-green-600",
            bg: "bg-green-50",
            title: "Self-Improving Loop",
            desc: "Every 50 calls triggers a fine-tuning run. Compounding advantage over time.",
            badge: "Auto",
          },
        ].map(({ icon: Icon, iconCls, bg, title, desc, badge }) => (
          <div key={title} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-4`}>
              <Icon className={`w-5 h-5 ${iconCls}`} />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-neutral-900">{title}</h3>
              <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">{badge}</span>
            </div>
            <p className="text-sm text-neutral-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="font-semibold text-neutral-900">Recent Calls</h2>
          {calls.length > 0 && (
            <Link href="/calls" className="text-xs text-brand-500 hover:text-brand-600 transition-colors">
              View all →
            </Link>
          )}
        </div>
        {recentCalls.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Phone className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">No calls yet.</p>
            {agents.length > 0 && (
              <Link href="/calls" className="inline-flex items-center gap-1 mt-3 text-sm text-brand-500 hover:text-brand-600">
                Make your first call <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {recentCalls.map((call: any) => (
              <div key={call.id} className="px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{call.phone_number}</p>
                  <p className="text-xs text-neutral-400">{call.pipeline_mode} pipeline · {call.direction}</p>
                </div>
                <div className="flex items-center gap-3">
                  {call.duration_seconds && (
                    <p className="text-xs text-neutral-400">{call.duration_seconds}s</p>
                  )}
                  {(() => {
                    const s = STATUS_MAP[call.status] ?? { label: call.status, cls: "text-neutral-500 bg-neutral-100 border-neutral-200" };
                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${s.cls}`}>
                        {s.pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
