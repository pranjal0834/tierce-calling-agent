"use client";
import { useEffect, useState } from "react";
import {
  Phone, Bot, Brain, Zap, TrendingUp, Activity,
  AlertCircle, ArrowRight, ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import OnboardingTour from "@/components/OnboardingTour";
import { getAgents, getCalls } from "@/lib/api";
import toast from "react-hot-toast";

const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  completed:    { label: "Completed",    dot: "bg-success-400", text: "text-success-700", bg: "bg-success-50" },
  in_progress:  { label: "Live",         dot: "bg-brand-400 animate-pulse", text: "text-brand-700", bg: "bg-brand-50" },
  ringing:      { label: "Ringing",      dot: "bg-warning-400 animate-pulse", text: "text-warning-700", bg: "bg-warning-50" },
  initiated:    { label: "Initiated",    dot: "bg-warning-400", text: "text-warning-700", bg: "bg-warning-50" },
  not_answered: { label: "No Answer",    dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" },
  failed:       { label: "Failed",       dot: "bg-error-400", text: "text-error-700", bg: "bg-error-50" },
  voicemail:    { label: "Voicemail",    dot: "bg-warning-400", text: "text-warning-700", bg: "bg-warning-50" },
  cancelled:    { label: "Cancelled",    dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" },
};

function StatCard({ label, value, icon: Icon, iconColor, iconBg, trend }: {
  label: string; value: string | number;
  icon: React.ElementType; iconColor: string; iconBg: string;
  trend?: string;
}) {
  return (
    <div className="snap-start shrink-0 sm:shrink min-w-[160px] sm:min-w-0 bg-white rounded-xl border border-neutral-200 shadow-card p-5 flex flex-col gap-3 hover:shadow-hover transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-neutral-500">{label}</span>
        <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-neutral-900 leading-none tracking-tight">{value}</span>
        {trend && (
          <span className="text-xs font-medium text-success-600 bg-success-50 px-1.5 py-0.5 rounded-full mb-0.5">{trend}</span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [calls,  setCalls]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAgents(), getCalls()])
      .then(([a, c]) => {
        setAgents(a);
        setCalls(c.items || c);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OnboardingTour />
      {/* API error */}
      {apiError && (
        <div role="alert" className="flex items-start gap-3 p-4 bg-error-50 border border-error-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-error-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-error-700">Unable to load data</p>
            <p className="text-sm text-error-600 mt-0.5">{apiError}</p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 snap-x snap-mandatory scroll-thin">
        <StatCard label="Total Agents"  value={agents.length}      icon={Bot}      iconColor="text-brand-500"    iconBg="bg-brand-50"   />
        <StatCard label="Total Calls"   value={calls.length}       icon={Phone}    iconColor="text-success-600"  iconBg="bg-success-50" />
        <StatCard label="Active Now"    value={activeCalls.length} icon={Activity} iconColor="text-warning-600"    iconBg="bg-warning-50"   />
        <StatCard label="Native Audio"  value={`${nativeAgents}`}  icon={Zap}      iconColor="text-violet-600"   iconBg="bg-violet-50"  />
      </div>

      {/* Empty onboarding state */}
      {!apiError && agents.length === 0 && (
        <div role="alert" className="bg-white border border-dashed border-neutral-300 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-brand-500" />
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
      )}

      {/* Two-column: feature highlights + recent calls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Feature highlights — 1 col */}
        <div className="space-y-3">
          {[
            {
              icon: Zap, iconCls: "text-violet-600", bg: "bg-violet-50",
              title: "Native Audio",
              desc: "GPT-4o Realtime API — raw audio in/out. No STT/TTS latency.",
              badge: "~300ms faster",
            },
            {
              icon: Brain, iconCls: "text-pink-600", bg: "bg-pink-50",
              title: "Emotional Intelligence",
              desc: "Pitch, energy & sentiment fused — agent adapts in real-time.",
              badge: "Live",
            },
            {
              icon: TrendingUp, iconCls: "text-success-600", bg: "bg-success-50",
              title: "Self-Improving Loop",
              desc: "Every 50 calls triggers a fine-tuning run automatically.",
              badge: "Auto",
            },
          ].map(({ icon: Icon, iconCls, bg, title, desc, badge }) => (
            <div key={title} className="bg-white rounded-xl border border-neutral-200 shadow-card p-4 flex items-start gap-3 hover:shadow-hover transition-shadow duration-200">
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon className={`w-4 h-4 ${iconCls}`} />
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
            <div role="alert" className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
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
