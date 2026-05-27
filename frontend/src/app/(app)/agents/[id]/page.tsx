"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Layers, Pencil, Trash2, Phone,
  CheckCircle2, XCircle, Clock, TrendingUp,
  Smile, Mic2, Network, Wrench, Brain
} from "lucide-react";
import Link from "next/link";
import { getAgent, getCalls, getAgentAnalytics, deleteAgent } from "@/lib/api";
import toast from "react-hot-toast";
import { ToolsTab } from "@/components/tools/ToolsTab";

const VOICE_LABELS: Record<string, string> = {
  alloy: "Alloy", ash: "Ash", ballad: "Ballad", coral: "Coral",
  echo: "Echo", sage: "Sage", shimmer: "Shimmer", verse: "Verse",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed:     { label: "Completed",    cls: "bg-green-500/10 text-green-400" },
    "in-progress": { label: "Live",         cls: "bg-blue-500/10 text-blue-400 animate-pulse" },
    in_progress:   { label: "Live",         cls: "bg-blue-500/10 text-blue-400 animate-pulse" },
    ringing:       { label: "Ringing",      cls: "bg-yellow-500/10 text-yellow-400 animate-pulse" },
    initiated:     { label: "Initiated",    cls: "bg-yellow-500/10 text-yellow-400" },
    not_answered:  { label: "Not Answered", cls: "bg-gray-500/10 text-gray-400" },
    failed:        { label: "Failed",       cls: "bg-red-500/10 text-red-400" },
    cancelled:     { label: "Cancelled",    cls: "bg-gray-500/10 text-gray-400" },
    voicemail:     { label: "Voicemail",    cls: "bg-orange-500/10 text-orange-400" },
  };
  const b = map[status] ?? { label: status, cls: "bg-gray-500/10 text-gray-400" };
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${b.cls}`}>{b.label}</span>;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      {children}
    </div>
  );
}

export default function AgentViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<any>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "tools">( "overview");
  const [toolsCount, setToolsCount] = useState(0);

  useEffect(() => {
    Promise.all([
      getAgent(id),
      getCalls(id),
      getAgentAnalytics(id),
    ]).then(([a, c, an]) => {
      setAgent(a);
      setCalls(c.slice(0, 10));
      setAnalytics(an);
      setToolsCount(a.config?.tools?.length ?? 0);
    }).catch(() => toast.error("Failed to load agent")).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    try {
      await deleteAgent(id);
      toast.success("Agent deleted");
      router.push("/agents");
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-24 text-gray-400">
        Agent not found.{" "}
        <Link href="/agents" className="text-brand-400 hover:underline">Back to agents</Link>
      </div>
    );
  }

  const completedCalls = calls.filter(c => c.status === "completed").length;
  const avgDuration = calls.length
    ? Math.round(calls.filter(c => c.duration_seconds).reduce((s, c) => s + (c.duration_seconds || 0), 0) / Math.max(calls.filter(c => c.duration_seconds).length, 1))
    : 0;

  const features = [
    { key: "backchannel_enabled", label: "Backchannel Engine", icon: Mic2, color: "text-green-400" },
    { key: "emotional_intelligence", label: "Emotional Intelligence", icon: Smile, color: "text-pink-400" },
    { key: "predictive_engine", label: "Predictive Engine", icon: TrendingUp, color: "text-orange-400" },
    { key: "memory_graph", label: "Memory Graph", icon: Network, color: "text-blue-400" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/agents" className="mt-1 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                agent.pipeline_mode === "native" ? "bg-purple-500/20" : "bg-blue-500/20"
              }`}>
                {agent.pipeline_mode === "native"
                  ? <Zap className="w-5 h-5 text-purple-400" />
                  : <Layers className="w-5 h-5 text-blue-400" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
                {agent.description && <p className="text-sm text-gray-400">{agent.description}</p>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/agents?edit=${id}`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Calls" value={analytics?.total_calls ?? calls.length} />
        <Stat label="Completed" value={analytics?.completed_calls ?? completedCalls} />
        <Stat
          label="Avg Duration"
          value={`${analytics?.avg_duration_seconds ? Math.round(analytics.avg_duration_seconds) : avgDuration}s`}
          sub={analytics?.avg_duration_seconds ? `${Math.round(analytics.avg_duration_seconds / 60)}m avg` : undefined}
        />
        <Stat
          label="Sentiment"
          value={analytics?.avg_sentiment_score != null ? `${(analytics.avg_sentiment_score * 100).toFixed(0)}%` : "—"}
          sub="avg positivity"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800">
        {(["overview", "tools"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-brand-500 text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "overview" ? <Layers className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
            {tab === "overview" ? "Overview" : "Tools"}
            {tab === "tools" && toolsCount > 0 && (
              <span className="text-xs bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">
                {toolsCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-3 gap-4">
          {/* Left: Configuration */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Configuration</h2>
              <Row label="Pipeline">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  agent.pipeline_mode === "native" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                }`}>
                  {agent.pipeline_mode === "native" ? "Native Audio" : "Classic Pipeline"}
                </span>
              </Row>
              <Row label="Model">
                <span className="text-sm text-white font-mono">{agent.llm_model}</span>
              </Row>
              <Row label="Voice">
                <span className="text-sm text-white">{VOICE_LABELS[agent.voice_id] ?? agent.voice_id ?? "—"}</span>
              </Row>
              <Row label="Status">
                {agent.is_active
                  ? <span className="flex items-center gap-1 text-sm text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                  : <span className="flex items-center gap-1 text-sm text-gray-400"><XCircle className="w-3.5 h-3.5" /> Inactive</span>}
              </Row>
              <Row label="Accent">
                <span className="text-sm text-white">{agent.config?.accent || "Default (Neutral)"}</span>
              </Row>
              <Row label="Speech Pace">
                <span className="text-sm text-white capitalize">{agent.config?.speech_pace || "Natural"}</span>
              </Row>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Languages</h2>
              {agent.config?.languages?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {agent.config.languages.map((lang: string, i: number) => (
                    <span
                      key={lang}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        i === 0
                          ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
                          : "bg-gray-800 text-gray-300 border border-gray-700"
                      }`}
                    >
                      {lang}{i === 0 && agent.config.languages.length > 1 ? " (primary)" : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-400">English (default)</span>
              )}
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Features</h2>
              {features.map(({ key, label, icon: Icon, color }) => {
                const enabled = agent.config?.[key];
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${enabled ? color : "text-gray-600"}`} />
                      <span className={`text-sm ${enabled ? "text-gray-200" : "text-gray-500"}`}>{label}</span>
                    </div>
                    <span className={`text-xs font-medium ${enabled ? "text-green-400" : "text-gray-600"}`}>
                      {enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: System Prompt + Recent Calls */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">System Prompt</h2>
              </div>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                {agent.system_prompt}
              </pre>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Recent Calls</h2>
                </div>
                <Link href={`/calls?agent=${id}`} className="text-xs text-brand-400 hover:text-brand-300">
                  View all →
                </Link>
              </div>
              {calls.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No calls yet for this agent.</div>
              ) : (
                <div className="space-y-2">
                  {calls.map((call: any) => (
                    <div key={call.id} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          call.direction === "outbound" ? "bg-brand-500/15" : "bg-green-500/15"
                        }`}>
                          <Phone className={`w-3.5 h-3.5 ${call.direction === "outbound" ? "text-brand-400" : "text-green-400"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white font-mono truncate">{call.phone_number}</p>
                          <p className="text-xs text-gray-500">
                            {new Date((call.created_at.endsWith("Z") || call.created_at.includes("+") ? call.created_at : call.created_at + "Z")).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {call.duration_seconds != null && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                          </span>
                        )}
                        <StatusBadge status={call.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "tools" && <ToolsTab agentId={id} onToolsChange={setToolsCount} />}
    </div>
  );
}
