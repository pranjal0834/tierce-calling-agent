"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Layers, Pencil, Trash2, Phone,
  CheckCircle2, XCircle, Clock,
  Wrench, Brain
} from "lucide-react";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { getAgent, getCalls, getAgentAnalytics, deleteAgent, createAgent } from "@/lib/api";
import toast from "react-hot-toast";
import { ToolsTab } from "@/components/tools/ToolsTab";
import { toastUndo } from "@/lib/toast-undo";

// Gemini voices (current) plus legacy OpenAI ids so older agents still show a name.
const VOICE_LABELS: Record<string, string> = {
  Aoede: "Aoede", Kore: "Kore", Leda: "Leda", Callirrhoe: "Callirrhoe",
  Puck: "Puck", Charon: "Charon", Fenrir: "Fenrir", Orus: "Orus",
  alloy: "Alloy", ash: "Ash", ballad: "Ballad", coral: "Coral",
  echo: "Echo", sage: "Sage", shimmer: "Shimmer", verse: "Verse",
};

const TOOL_TYPE_LABELS: Record<string, string> = {
  webhook: "Webhook", end_call: "End Call", transfer_call: "Transfer to Human",
  calendar_booking: "Book Appointment", schedule_callback: "Schedule Callback",
};

// One-line detail for a tool, shown next to its name in the Overview summary.
function toolDetail(t: any): string {
  if (t.type === "webhook" && t.config?.url) {
    try { return new URL(String(t.config.url)).host; } catch { return String(t.config.url); }
  }
  if (t.type === "transfer_call" && t.config?.transfer_to) return `→ ${t.config.transfer_to}`;
  if (t.type === "calendar_booking" && t.config?.integration) {
    const m: Record<string, string> = { calcom: "Cal.com", calendly: "Calendly", google_calendar: "Google Calendar" };
    return m[String(t.config.integration)] ?? String(t.config.integration);
  }
  return "";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; dot: string; text: string; bg: string }> = {
    completed:     { label: "Completed", dot: "bg-success-400",             text: "text-success-700", bg: "bg-success-50"  },
    "in-progress": { label: "Live",      dot: "bg-brand-400 animate-pulse", text: "text-brand-700",   bg: "bg-brand-50"    },
    in_progress:   { label: "Live",      dot: "bg-brand-400 animate-pulse", text: "text-brand-700",   bg: "bg-brand-50"    },
    ringing:       { label: "Ringing",   dot: "bg-warning-400 animate-pulse", text: "text-warning-700",   bg: "bg-warning-50"    },
    initiated:     { label: "Initiated", dot: "bg-warning-400",               text: "text-warning-700",   bg: "bg-warning-50"    },
    not_answered:  { label: "No Answer", dot: "bg-neutral-400",             text: "text-neutral-600", bg: "bg-neutral-100" },
    failed:        { label: "Failed",    dot: "bg-error-400",                 text: "text-error-700",     bg: "bg-error-50"      },
    cancelled:     { label: "Cancelled", dot: "bg-neutral-400",             text: "text-neutral-600", bg: "bg-neutral-100" },
    voicemail:     { label: "Voicemail", dot: "bg-warning-400",              text: "text-warning-700",  bg: "bg-warning-50"   },
  };
  const b = map[status] ?? { label: status, dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${b.bg} ${b.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.dot}`} />
      {b.label}
    </span>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
      <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <span className="text-sm text-neutral-500">{label}</span>
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
  const agentRef = useRef<any>(null);

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
    agentRef.current = agent;
    await deleteAgent(id);
    toastUndo({
      message: "Agent deleted",
      onUndo: async () => {
        await createAgent(agentRef.current);
      },
    });
    router.push("/agents");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-24 text-neutral-500">
        Agent not found.{" "}
        <Link href="/agents" className="text-brand-500 hover:underline">Back to agents</Link>
      </div>
    );
  }

  const completedCalls = calls.filter(c => c.status === "completed").length;
  const avgDuration = calls.length
    ? Math.round(calls.filter(c => c.duration_seconds).reduce((s, c) => s + (c.duration_seconds || 0), 0) / Math.max(calls.filter(c => c.duration_seconds).length, 1))
    : 0;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Agents", href: "/agents" }, { label: agent.name }]} />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/agents"))}
            className="mt-1 text-neutral-400 hover:text-neutral-900 transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/20">
                <Zap className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">{agent.name}</h1>
                {agent.description && <p className="text-sm text-neutral-500">{agent.description}</p>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/agents?edit=${id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 rounded-lg shadow-xs transition-all duration-150"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Link>
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium text-error-500 hover:text-error-600 bg-error-50 hover:bg-error-100 border border-error-100 rounded-lg transition-colors"
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
      <div className="flex items-center gap-1 border-b border-neutral-200">
        {(["overview", "tools"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-brand-500 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab === "overview" ? <Layers className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
            {tab === "overview" ? "Overview" : "Tools"}
            {tab === "tools" && toolsCount > 0 && (
              <span className="text-xs bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full">
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
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Configuration</h2>
              <Row label="Pipeline">
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-purple-500/10 text-purple-400">
                  Native Audio
                </span>
              </Row>
              <Row label="Model">
                <span className="text-sm text-neutral-900">Vaaniq Voice Engine</span>
              </Row>
              <Row label="Voice">
                <span className="text-sm text-neutral-900">{VOICE_LABELS[agent.voice_id] ?? agent.voice_id ?? "—"}</span>
              </Row>
              <Row label="Status">
                {agent.is_active
                  ? <span className="flex items-center gap-1 text-sm text-success-600"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                  : <span className="flex items-center gap-1 text-sm text-neutral-400"><XCircle className="w-3.5 h-3.5" /> Inactive</span>}
              </Row>
              <Row label="Accent">
                <span className="text-sm text-neutral-900">{agent.config?.accent || "Default (Neutral)"}</span>
              </Row>
              <Row label="Speech Pace">
                <span className="text-sm text-neutral-900 capitalize">{agent.config?.speech_pace || "Natural"}</span>
              </Row>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Languages</h2>
              {agent.config?.languages?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {agent.config.languages.map((lang: string, i: number) => (
                    <span
                      key={lang}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        i === 0
                          ? "bg-brand-50 text-brand-600 border border-brand-200"
                          : "bg-neutral-100 text-neutral-700 border border-neutral-200"
                      }`}
                    >
                      {lang}{i === 0 && agent.config.languages.length > 1 ? " (primary)" : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-neutral-500">English (default)</span>
              )}
            </div>

            {/* Tools summary */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Tools</h2>
                <button
                  onClick={() => setActiveTab("tools")}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  {(agent.config?.tools?.length ?? 0) > 0 ? "Manage" : "Add"}
                </button>
              </div>
              {(agent.config?.tools?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {agent.config.tools.map((t: any) => {
                    const detail = toolDetail(t);
                    return (
                      <div key={t.id ?? t.name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.enabled === false ? "bg-neutral-300" : "bg-success-500"}`} />
                          <span className="text-sm text-neutral-800 truncate">{TOOL_TYPE_LABELS[t.type] ?? t.type}</span>
                        </div>
                        {detail && <span className="text-xs text-neutral-400 font-mono truncate max-w-[50%]">{detail}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-neutral-400">No tools configured yet.</p>
              )}
            </div>
          </div>

          {/* Right: System Prompt + Recent Calls */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-brand-500" />
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">System Prompt</h2>
              </div>
              <pre className="text-sm text-neutral-700 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                {agent.system_prompt}
              </pre>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-brand-500" />
                  <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Recent Calls</h2>
                </div>
                <Link href={`/calls?agent=${id}`} className="text-xs text-brand-500 hover:text-brand-600">
                  View all →
                </Link>
              </div>
              {calls.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 text-sm">No calls yet for this agent.</div>
              ) : (
                <div className="space-y-2">
                  {calls.map((call: any) => (
                    <div key={call.id} className="flex items-center justify-between py-2.5 border-b border-neutral-200 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          call.direction === "outbound" ? "bg-brand-50" : "bg-success-50"
                        }`}>
                          <Phone className={`w-3.5 h-3.5 ${call.direction === "outbound" ? "text-brand-600" : "text-success-600"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-neutral-900 font-mono truncate">{call.phone_number}</p>
                          <p className="text-xs text-neutral-500">
                            {new Date((call.created_at.endsWith("Z") || call.created_at.includes("+") ? call.created_at : call.created_at + "Z")).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {call.duration_seconds != null && (
                          <span className="text-xs text-neutral-500 flex items-center gap-1">
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
