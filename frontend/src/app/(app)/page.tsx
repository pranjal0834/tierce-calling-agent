"use client";
import { useEffect, useState } from "react";
import { Phone, Bot, Brain, Zap, TrendingUp, Activity, AlertCircle, ArrowRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { getAgents, getCalls, getBillingBalance } from "@/lib/api";
import toast from "react-hot-toast";

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
    { label: "Total Agents",   value: agents.length,      icon: Bot,      color: "text-blue-400"   },
    { label: "Total Calls",    value: calls.length,        icon: Phone,    color: "text-green-400"  },
    { label: "Active Calls",   value: activeCalls.length,  icon: Activity, color: "text-yellow-400" },
    { label: "Native Audio",   value: `${agents.filter((a: any) => a.pipeline_mode === "native").length} agents`, icon: Zap, color: "text-purple-400" },
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
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">Real-time overview of your voice agent platform</p>
        </div>

        {/* Balance chip */}
        <Link
          href="/billing"
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors flex-shrink-0 ${
            balance === null
              ? "bg-gray-900 border-gray-700"
              : balance <= 0
              ? "bg-red-500/10 border-red-500/40 hover:border-red-500/70"
              : balance <= 5
              ? "bg-yellow-500/10 border-yellow-500/40 hover:border-yellow-500/70"
              : "bg-indigo-500/10 border-indigo-500/30 hover:border-indigo-500/60"
          }`}
        >
          <CreditCard className={`w-4 h-4 ${
            balance === null ? "text-gray-500" :
            balance <= 0 ? "text-red-400" :
            balance <= 5 ? "text-yellow-400" : "text-indigo-400"
          }`} />
          <div className="text-right">
            <p className={`text-sm font-semibold leading-tight ${
              balance === null ? "text-gray-400" :
              balance <= 0 ? "text-red-400" :
              balance <= 5 ? "text-yellow-400" : "text-white"
            }`}>
              {balance === null ? "—" : `${balance.toFixed(1)} min`}
            </p>
            <p className="text-xs text-gray-500 leading-tight">
              {balance !== null && balance <= 0 ? "Top up now" : "Credits"}
            </p>
          </div>
        </Link>
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">Unable to load data</p>
            <p className="text-sm text-red-400/80 mt-0.5">{apiError}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">{label}</span>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Empty state CTA — shown when no agents yet */}
      {!apiError && agents.length === 0 && (
        <div className="bg-gray-900 border border-gray-700 border-dashed rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-brand-500/15 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-brand-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Create your first agent</h2>
          <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
            Set up a voice AI agent with a system prompt, voice, and language. Once created, you can make your first call in seconds.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors"
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
            color: "text-purple-400 bg-purple-500/10",
            title: "Native Audio Pipeline",
            desc: "GPT-4o Realtime API — raw audio in, raw audio out. No STT or TTS latency.",
            badge: "~300ms faster",
          },
          {
            icon: Brain,
            color: "text-pink-400 bg-pink-500/10",
            title: "Emotional Intelligence",
            desc: "Pitch, energy, pace analysis fused with sentiment — agent adapts in real-time.",
            badge: "Live",
          },
          {
            icon: TrendingUp,
            color: "text-green-400 bg-green-500/10",
            title: "Self-Improving Loop",
            desc: "Every 50 calls triggers a fine-tuning run. Compounding advantage over time.",
            badge: "Auto",
          },
        ].map(({ icon: Icon, color, title, desc, badge }) => (
          <div key={title} className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-4`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-white">{title}</h3>
              <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">{badge}</span>
            </div>
            <p className="text-sm text-gray-400">{desc}</p>
          </div>
        ))}
      </div>

      {/* Recent Calls */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Recent Calls</h2>
          {calls.length > 0 && (
            <Link href="/calls" className="text-xs text-brand-400 hover:text-brand-300">
              View all →
            </Link>
          )}
        </div>
        {recentCalls.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Phone className="w-8 h-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No calls yet.</p>
            {agents.length > 0 && (
              <Link href="/calls" className="inline-flex items-center gap-1 mt-3 text-sm text-brand-400 hover:text-brand-300">
                Make your first call <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {recentCalls.map((call: any) => (
              <div key={call.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    call.status === "in_progress" ? "bg-green-400 animate-pulse" :
                    call.status === "completed"   ? "bg-gray-500" : "bg-yellow-400"
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-white">{call.phone_number}</p>
                    <p className="text-xs text-gray-500">{call.pipeline_mode} pipeline • {call.direction}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    call.status === "in_progress" ? "bg-green-500/10 text-green-400" :
                    call.status === "completed"   ? "bg-gray-800 text-gray-400" :
                    "bg-yellow-500/10 text-yellow-400"
                  }`}>{call.status}</span>
                  {call.duration_seconds && (
                    <p className="text-xs text-gray-500 mt-1">{call.duration_seconds}s</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
