"use client";
import { useEffect, useRef, useState } from "react";
import {
  Phone, PhoneCall, Clock, Zap, Activity, ChevronRight, Upload,
  Users, X, FileSpreadsheet, Calendar, MessageSquare, BarChart2,
  User, Globe, TrendingUp, CheckCircle2, XCircle, Mic2, ArrowUpRight,
  ArrowDownLeft, Database, Repeat, DollarSign,
} from "lucide-react";
import { getCalls, getAgents, getCallDetail, initiateCall, bulkCall, getRecordingUrl } from "@/lib/api";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contact {
  phone_number: string;
  name?: string;
  company?: string;
  email?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

// Backend returns UTC datetimes without 'Z' — append it so the browser parses them as UTC
function toUTC(iso: string) {
  return iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
}

function fmtDuration(s?: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(toUTC(iso)).toLocaleString("en-GB", {
    timeZone: IST, day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(toUTC(iso)).toLocaleTimeString("en-GB", {
    timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(toUTC(iso));
    if (isNaN(d.getTime())) return iso;
    // If the stored value has no time component (midnight UTC = time was never specified),
    // show date only to avoid misleading "12:00 am" or IST offset artifacts
    const hasExplicitTime = /T\d{2}:\d{2}/.test(iso) && !/T00:00(:00)?(Z|$)/.test(iso);
    if (hasExplicitTime) {
      return d.toLocaleString("en-GB", {
        timeZone: IST, weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: true,
      });
    }
    return d.toLocaleString("en-GB", {
      timeZone: IST, weekday: "short", day: "2-digit", month: "short",
    });
  } catch {
    return iso;
  }
}

const STATUS_MAP: Record<string, { label: string; dot: string; text: string }> = {
  completed:    { label: "Completed",    dot: "bg-green-500",              text: "text-green-400" },
  in_progress:  { label: "Live",         dot: "bg-blue-400 animate-pulse", text: "text-blue-400" },
  ringing:      { label: "Ringing",      dot: "bg-yellow-400 animate-pulse", text: "text-yellow-400" },
  initiated:    { label: "Initiated",    dot: "bg-yellow-500",             text: "text-yellow-400" },
  not_answered: { label: "Not Answered", dot: "bg-gray-500",               text: "text-gray-400" },
  failed:       { label: "Failed",       dot: "bg-red-500",                text: "text-red-400" },
  voicemail:    { label: "Voicemail",    dot: "bg-orange-400",             text: "text-orange-400" },
  cancelled:    { label: "Cancelled",    dot: "bg-gray-600",               text: "text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, dot: "bg-gray-500", text: "text-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const INTEREST_COLOR: Record<string, string> = {
  high: "text-green-400",
  medium: "text-yellow-400",
  low: "text-orange-400",
  not_interested: "text-red-400",
};

// ── Audio player with VBR duration fix ───────────────────────────────────────
function CallAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onLoaded() {
      if (!audio) return;
      if (!isFinite(audio.duration)) {
        // VBR MP3: browser reports Infinity — seek to end to force duration scan
        audio.currentTime = 1e101;
      }
    }

    function onTimeUpdate() {
      if (!audio) return;
      if (isFinite(audio.duration) && audio.currentTime > 0) {
        audio.currentTime = 0;
        audio.removeEventListener("timeupdate", onTimeUpdate);
      }
    }

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [src]);

  return (
    <audio ref={audioRef} controls className="w-full mt-1" src={src} preload="auto">
      Your browser does not support audio.
    </audio>
  );
}

// ── CSV / Excel parser ────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<Contact[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row: any) => ({
      phone_number: String(
        row["phone_number"] || row["phone"] || row["Phone"] ||
        row["Phone Number"] || row["PhoneNumber"] || row["mobile"] || row["Mobile"] || ""
      ).trim().replace(/\s/g, ""),
      name: row["name"] || row["Name"] || row["full_name"] || row["Full Name"] || undefined,
      company: row["company"] || row["Company"] || undefined,
      email: row["email"] || row["Email"] || undefined,
    }))
    .filter(c => c.phone_number.length >= 7);
}

function parseTextNumbers(text: string): Contact[] {
  return text.split(/[\n,;]+/).map(s => s.trim().replace(/\s/g, ""))
    .filter(s => s.length >= 7).map(phone => ({ phone_number: phone }));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "transcript" | "data">("overview");
  const [showDial, setShowDial] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [dialForm, setDialForm] = useState({ agent_id: "", phone_number: "" });

  useEffect(() => {
    getCalls().then(setCalls).catch((e: unknown) => { console.error("getCalls failed:", e); });
    getAgents().then(setAgents).catch(() => {});
  }, []);

  // Auto-refresh calls list: every 5s when there's a live call, every 10s otherwise
  useEffect(() => {
    const refresh = () => getCalls().then(setCalls).catch(() => {});
    const hasLive = calls.some((c: any) =>
      c.status === "in_progress" || c.status === "ringing" || c.status === "initiated"
    );
    const interval = setInterval(refresh, hasLive ? 5000 : 10000);
    return () => clearInterval(interval);
  }, [calls]);

  // Auto-refresh open detail panel when the selected call is still live
  useEffect(() => {
    if (!detail?.call?.id) return;
    const liveStatuses = new Set(["in_progress", "ringing", "initiated"]);
    if (!liveStatuses.has(detail.call.status)) return;
    const interval = setInterval(() => {
      getCallDetail(detail.call.id)
        .then(setDetail)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [detail?.call?.id, detail?.call?.status]);

  const openCall = async (call: any) => {
    setDetail(null);
    setActiveTab("overview");
    setDetailLoading(true);
    try {
      const d = await getCallDetail(call.id);
      setDetail(d);
    } catch {
      toast.error("Failed to load call detail");
    }
    setDetailLoading(false);
  };

  const handleDial = async () => {
    if (!dialForm.agent_id || !dialForm.phone_number) {
      toast.error("Select an agent and enter a phone number");
      return;
    }
    try {
      const call = await initiateCall(dialForm);
      setCalls((c: any[]) => [call, ...c]);
      setShowDial(false);
      toast.success("Call initiated!");
    } catch {
      toast.error("Failed to initiate call");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Calls</h1>
          <p className="text-gray-400 mt-1">Monitor and review all call sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-700"
          >
            <Users className="w-4 h-4" /> Bulk Call
          </button>
          <button
            onClick={() => setShowDial(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <PhoneCall className="w-4 h-4" /> Dial
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Call list ── */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            All Calls ({calls.length})
          </div>
          <div className="divide-y divide-gray-800/70 overflow-y-auto" style={{ maxHeight: "75vh" }}>
            {calls.length === 0 && (
              <div className="p-10 text-center text-gray-500 text-sm">No calls yet</div>
            )}
            {calls.map((call: any) => {
              const s = STATUS_MAP[call.status] ?? STATUS_MAP.initiated;
              const isSelected = detail?.call?.id === call.id;
              return (
                <button
                  key={call.id}
                  onClick={() => openCall(call)}
                  className={`w-full px-4 py-3 text-left transition-colors ${isSelected ? "bg-gray-800" : "hover:bg-gray-800/40"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        call.direction === "outbound" ? "bg-brand-500/15" : "bg-green-500/15"
                      }`}>
                        {call.direction === "outbound"
                          ? <ArrowUpRight className="w-3.5 h-3.5 text-brand-400" />
                          : <ArrowDownLeft className="w-3.5 h-3.5 text-green-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate font-mono">{call.phone_number}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(toUTC(call.created_at)).toLocaleDateString("en-GB", { timeZone: IST, day: "2-digit", month: "short" })}
                          {" · "}{new Date(toUTC(call.created_at)).toLocaleTimeString("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true })}
                          {call.duration_seconds ? ` · ${fmtDuration(call.duration_seconds)}` : ""}
                          {call.cost_usd != null ? ` · $${call.cost_usd.toFixed(4)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Detail panel ── */}
        <div className="lg:col-span-3 bg-gray-900 rounded-xl border border-gray-800 flex flex-col" style={{ minHeight: "75vh" }}>
          {detailLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!detailLoading && !detail && (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
              <Phone className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Select a call to view full details</p>
            </div>
          )}

          {!detailLoading && detail && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-800 flex-shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <p className="font-semibold text-white text-lg">
                        {detail.contact?.name || "Unknown Caller"}
                      </p>
                      {detail.contact?.company && (
                        <span className="text-sm text-gray-500">· {detail.contact.company}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-400 font-mono">{detail.call.phone_number}</span>
                      <StatusBadge status={detail.call.status} />
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        detail.call.direction === "outbound"
                          ? "bg-brand-500/10 text-brand-400"
                          : "bg-green-500/10 text-green-400"
                      }`}>
                        {detail.call.direction === "outbound" ? "↑ Outbound" : "↓ Inbound"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500">{fmtDate(detail.call.created_at)}</p>
                    <p className="text-sm font-medium text-white mt-0.5">{fmtDuration(detail.call.duration_seconds)}</p>
                  </div>
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-5 gap-2 mt-3">
                  <StatChip
                    icon={<Globe className="w-3 h-3" />}
                    label="Language"
                    value={detail.call.extra_data?.language_used || detail.agent?.languages?.[0] || "English"}
                  />
                  <StatChip
                    icon={<TrendingUp className="w-3 h-3" />}
                    label="Sentiment"
                    value={detail.call.sentiment_score != null
                      ? `${(detail.call.sentiment_score * 10).toFixed(0)}%`
                      : "—"}
                    valueClass={
                      detail.call.sentiment_score == null ? "text-gray-400" :
                      detail.call.sentiment_score >= 0.7 ? "text-green-400" :
                      detail.call.sentiment_score >= 0.4 ? "text-yellow-400" : "text-red-400"
                    }
                  />
                  <StatChip
                    icon={<DollarSign className="w-3 h-3" />}
                    label="Cost"
                    value={detail.call.cost_usd != null ? `$${detail.call.cost_usd.toFixed(4)}` : "—"}
                    valueClass={detail.call.cost_usd != null ? "text-yellow-300" : "text-gray-400"}
                  />
                  <StatChip
                    icon={<Repeat className="w-3 h-3" />}
                    label="Total Calls"
                    value={`${detail.contact?.total_calls ?? 1}×`}
                  />
                  <StatChip
                    icon={<Calendar className="w-3 h-3" />}
                    label="Appointment"
                    value={detail.call.extra_data?.appointment_booked ? "Booked" : "No"}
                    valueClass={detail.call.extra_data?.appointment_booked ? "text-green-400" : "text-gray-400"}
                  />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-800 flex-shrink-0">
                {(["overview", "transcript", "data"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-brand-500 text-white"
                        : "border-transparent text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {tab === "overview" ? "Overview" : tab === "transcript" ? "Transcript" : "Extracted Data"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-4">

                {/* ── OVERVIEW TAB ── */}
                {activeTab === "overview" && (
                  <div className="space-y-4">
                    {/* Summary */}
                    {detail.call.summary && (
                      <Section icon={<MessageSquare className="w-4 h-4 text-brand-400" />} title="Summary">
                        <p className="text-sm text-gray-300 leading-relaxed">{detail.call.summary}</p>
                      </Section>
                    )}

                    {/* Appointment */}
                    {detail.call.extra_data?.appointment_booked && (
                      <Section icon={<Calendar className="w-4 h-4 text-green-400" />} title="Appointment Booked">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <p className="text-sm text-white font-medium">
                            {detail.call.extra_data.appointment_datetime
                              ? fmtDateTime(detail.call.extra_data.appointment_datetime)
                              : "Appointment booked — time not specified"}
                          </p>
                        </div>
                      </Section>
                    )}

                    {/* Agent + call info */}
                    <Section icon={<Zap className="w-4 h-4 text-purple-400" />} title="Call Info">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        <InfoRow label="Agent" value={detail.agent?.name || "—"} />
                        <InfoRow label="Pipeline" value={detail.call.pipeline_mode} />
                        <InfoRow label="Start time" value={fmtDate(detail.call.started_at)} />
                        <InfoRow label="End time" value={fmtDate(detail.call.ended_at)} />
                        <InfoRow label="Languages" value={(detail.agent?.languages || ["English"]).join(", ")} />
                        <InfoRow label="Language used" value={detail.call.extra_data?.language_used || "—"} />
                        <InfoRow
                          label="Ended by"
                          value={detail.call.extra_data?.ended_by === "caller" ? "Caller" : detail.call.extra_data?.ended_by === "agent" ? "Agent" : "—"}
                          valueClass={detail.call.extra_data?.ended_by === "caller" ? "text-orange-400" : detail.call.extra_data?.ended_by === "agent" ? "text-blue-400" : "text-gray-400"}
                        />
                      </div>
                    </Section>

                    {/* Caller profile */}
                    <Section icon={<User className="w-4 h-4 text-blue-400" />} title="Caller Profile">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        <InfoRow label="Name" value={detail.contact?.name || detail.call.extra_data?.caller_name || "—"} />
                        <InfoRow label="Phone" value={detail.contact?.phone_number || detail.call.phone_number} mono />
                        <InfoRow label="Email" value={detail.contact?.email || "—"} />
                        <InfoRow label="Company" value={detail.contact?.company || "—"} />
                        <InfoRow
                          label="Interest level"
                          value={detail.call.extra_data?.caller_interest || "—"}
                          valueClass={INTEREST_COLOR[detail.call.extra_data?.caller_interest || ""] || "text-gray-300"}
                        />
                        <InfoRow label="Next steps" value={detail.call.extra_data?.next_steps || "—"} />
                      </div>
                    </Section>

                    {/* Call history */}
                    {detail.call_history?.length > 0 && (
                      <Section icon={<Repeat className="w-4 h-4 text-orange-400" />} title={`Call History (${detail.contact?.total_calls} total)`}>
                        <div className="space-y-1.5">
                          {detail.call_history.map((h: any) => (
                            <div key={h.id} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                {h.direction === "outbound"
                                  ? <ArrowUpRight className="w-3 h-3 text-brand-400" />
                                  : <ArrowDownLeft className="w-3 h-3 text-green-400" />}
                                <span className="text-xs text-gray-400">{fmtDate(h.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {h.duration_seconds && (
                                  <span className="text-xs text-gray-500">{fmtDuration(h.duration_seconds)}</span>
                                )}
                                <StatusBadge status={h.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                  </div>
                )}

                {/* ── TRANSCRIPT TAB ── */}
                {activeTab === "transcript" && (
                  <div className="space-y-2">
                    {detail.turns.length === 0 && (
                      <p className="text-gray-500 text-sm text-center py-10">No transcript available</p>
                    )}
                    {detail.turns.map((turn: any, idx: number) => (
                      <div key={turn.id}>
                        {/* Transfer divider — show once before the first post-transfer turn */}
                        {turn.from_transfer && (idx === 0 || !detail.turns[idx - 1].from_transfer) && (
                          <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 border-t border-orange-500/40" />
                            <span className="text-xs text-orange-400 font-medium px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30">
                              Call Transferred to Human
                            </span>
                            <div className="flex-1 border-t border-orange-500/40" />
                          </div>
                        )}
                      <div
                        className={`rounded-lg p-3 ${
                          turn.from_transfer
                            ? turn.role === "user"
                              ? "bg-gray-800/60 ml-6 border border-orange-500/10"
                              : "bg-orange-500/10 border border-orange-500/20 mr-6"
                            : turn.role === "user"
                            ? "bg-gray-800 ml-6"
                            : "bg-brand-500/10 border border-brand-500/20 mr-6"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${
                            turn.from_transfer
                              ? turn.role === "user" ? "text-gray-400" : "text-orange-400"
                              : turn.role === "user" ? "text-gray-400" : "text-brand-400"
                          }`}>
                            {turn.from_transfer
                              ? turn.role === "user" ? "Caller" : "Human Agent"
                              : turn.role === "user" ? "Caller" : "Agent"}
                          </span>
                          {turn.sentiment && (
                            <span className="text-xs text-gray-500">· {turn.sentiment}</span>
                          )}
                          {turn.created_at && (
                            <span className="text-xs text-gray-600 ml-auto">{fmtTime(turn.created_at)}</span>
                          )}
                          {turn.latency_ms && (
                            <span className="text-xs text-gray-600 flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />{turn.latency_ms}ms
                            </span>
                          )}
                          {turn.from_prediction_cache && (
                            <span className="text-xs text-green-400 flex items-center gap-0.5">
                              <Zap className="w-3 h-3" />cached
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-200">{turn.transcript || "(audio only)"}</p>
                        {turn.eval_score != null && (
                          <div className="mt-1.5 flex items-center gap-1">
                            <Activity className="w-3 h-3 text-gray-500" />
                            <span className={`text-xs ${
                              turn.eval_score >= 7 ? "text-green-400" :
                              turn.eval_score >= 5 ? "text-yellow-400" : "text-red-400"
                            }`}>score: {turn.eval_score.toFixed(1)}</span>
                            {turn.eval_feedback && (
                              <span className="text-xs text-gray-500"> — {turn.eval_feedback}</span>
                            )}
                          </div>
                        )}
                      </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── EXTRACTED DATA TAB ── */}
                {activeTab === "data" && (
                  <div className="space-y-4">
                    {/* Key points */}
                    {Array.isArray(detail.call.extra_data?.key_points) && detail.call.extra_data.key_points.length > 0 && (
                      <Section icon={<BarChart2 className="w-4 h-4 text-brand-400" />} title="Key Points">
                        <ul className="space-y-1.5">
                          {detail.call.extra_data.key_points.map((pt: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    {/* Appointment */}
                    <Section icon={<Calendar className="w-4 h-4 text-green-400" />} title="Appointment">
                      <div className="flex items-center gap-3">
                        {detail.call.extra_data?.appointment_booked
                          ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                          : <XCircle className="w-5 h-5 text-gray-500" />}
                        <div>
                          <p className="text-sm font-medium text-white">
                            {detail.call.extra_data?.appointment_booked ? "Appointment booked" : "No appointment booked"}
                          </p>
                          {detail.call.extra_data?.appointment_datetime && (
                            <p className="text-xs text-green-400 mt-0.5">
                              {fmtDateTime(detail.call.extra_data.appointment_datetime)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Section>

                    {/* Caller info extracted */}
                    <Section icon={<User className="w-4 h-4 text-blue-400" />} title="Extracted Caller Info">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        <InfoRow label="Name" value={detail.call.extra_data?.caller_name || "—"} />
                        <InfoRow
                          label="Interest"
                          value={detail.call.extra_data?.caller_interest || "—"}
                          valueClass={INTEREST_COLOR[detail.call.extra_data?.caller_interest || ""] || "text-gray-300"}
                        />
                        <InfoRow label="Next steps" value={detail.call.extra_data?.next_steps || "—"} />
                        <InfoRow label="Language used" value={detail.call.extra_data?.language_used || "—"} />
                      </div>
                    </Section>

                    {/* Sentiment */}
                    <Section icon={<TrendingUp className="w-4 h-4 text-pink-400" />} title="Sentiment & Emotions">
                      <div className="space-y-2">
                        {detail.call.sentiment_score != null && (() => {
                          // Score stored as 0–10 from evaluator
                          const pct = Math.min(100, Math.round((detail.call.sentiment_score / 10) * 100));
                          return (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-400">Overall positivity</span>
                                <span className={`text-sm font-bold ${
                                  pct >= 70 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"
                                }`}>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                        {typeof detail.call.emotion_profile === "object" &&
                          !Array.isArray(detail.call.emotion_profile) &&
                          Object.keys(detail.call.emotion_profile || {}).length > 0 && (() => {
                            const entries = Object.entries(detail.call.emotion_profile || {});
                            // Detect per-turn nested structure vs flat primitive map
                            const isPerTurn = entries.some(([, v]) => v !== null && typeof v === "object");
                            if (isPerTurn) {
                              const turnCount = entries.length;
                              const emotions: string[] = Array.from(new Set(
                                entries.map(([, v]: any) => v?.emotion).filter(Boolean)
                              ));
                              const avgEngagement = entries.reduce((s, [, v]: any) => s + (v?.engagement ?? 0), 0) / turnCount;
                              return (
                                <div className="mt-2 space-y-2">
                                  <p className="text-xs text-gray-500">{turnCount} turns analyzed</p>
                                  <div className="flex flex-wrap gap-2">
                                    {emotions.map((e) => (
                                      <span key={e} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full capitalize">{e}</span>
                                    ))}
                                    <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">
                                      engagement {Math.round(avgEngagement * 100)}%
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {entries.map(([k, v]: any) => (
                                  <span key={k} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-full capitalize">
                                    {k}: {typeof v === "number" ? `${Math.round(v * 100)}%` : String(v ?? "")}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                      </div>
                    </Section>

                    {/* Recording */}
                    <Section icon={<Mic2 className="w-4 h-4 text-gray-400" />} title="Recording">
                      {detail.call.has_recording ? (
                        <CallAudioPlayer src={getRecordingUrl(detail.call.id)} />
                      ) : (
                        <p className="text-sm text-gray-500">
                          {detail.call.status === "completed"
                            ? "Recording is being processed — check back in a moment."
                            : "No recording available for this call."}
                        </p>
                      )}
                    </Section>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dial modal */}
      {showDial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Initiate Call</h2>
              <button onClick={() => setShowDial(false)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm text-gray-300">Agent</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  value={dialForm.agent_id}
                  onChange={e => setDialForm(f => ({ ...f, agent_id: e.target.value }))}
                >
                  <option value="">Select agent...</option>
                  {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-gray-300">Phone Number</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="+1234567890"
                  value={dialForm.phone_number}
                  onChange={e => setDialForm(f => ({ ...f, phone_number: e.target.value }))}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowDial(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button
                onClick={handleDial}
                className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <PhoneCall className="w-4 h-4" /> Call
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <BulkCallModal
          agents={agents}
          onClose={() => setShowBulk(false)}
          onLaunched={(count: number) => {
            toast.success(`Campaign started — ${count} calls queued`);
            setShowBulk(false);
            setTimeout(() => getCalls().then(setCalls).catch(() => {}), 3000);
          }}
        />
      )}
    </div>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function StatChip({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1 text-gray-500 mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-semibold ${valueClass || "text-white"} truncate`}>{value}</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/40 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm mt-0.5 ${mono ? "font-mono" : ""} ${valueClass || "text-gray-200"}`}>{value}</p>
    </div>
  );
}

// ── Bulk Call Modal ───────────────────────────────────────────────────────────

function BulkCallModal({ agents, onClose, onLaunched }: {
  agents: any[];
  onClose: () => void;
  onLaunched: (count: number) => void;
}) {
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [agentId, setAgentId] = useState(agents[0]?.id || "");
  const [callsPerSecond, setCallsPerSecond] = useState(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseFile(file);
      setContacts(parsed);
      if (parsed.length === 0) toast.error("No valid phone numbers found in the file");
    } catch {
      toast.error("Failed to parse file");
    }
    setParsing(false);
  };

  const handlePasteParse = () => {
    const parsed = parseTextNumbers(pasteText);
    setContacts(parsed);
    if (parsed.length === 0) toast.error("No valid phone numbers found");
  };

  const handleStart = async () => {
    if (!agentId) { toast.error("Select an agent"); return; }
    if (contacts.length === 0) { toast.error("No contacts loaded"); return; }
    setLoading(true);
    try {
      await bulkCall({ agent_id: agentId, contacts, calls_per_second: callsPerSecond });
      onLaunched(contacts.length);
    } catch {
      toast.error("Failed to start campaign");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white">Bulk Call Campaign</h2>
            <p className="text-xs text-gray-400 mt-0.5">Upload CSV/Excel or paste numbers</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-gray-300 font-medium">Agent</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
              >
                <option value="">Select agent...</option>
                {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-gray-300 font-medium">Calls/second</label>
              <input type="number" min={0.1} max={5} step={0.5}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                value={callsPerSecond}
                onChange={e => setCallsPerSecond(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex gap-2 border-b border-gray-800">
            {(["file", "paste"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setContacts([]); setFileName(""); setPasteText(""); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-brand-500 text-white" : "border-transparent text-gray-400 hover:text-white"
                }`}>
                {t === "file" ? "Upload File" : "Paste Numbers"}
              </button>
            ))}
          </div>

          {tab === "file" && (
            <div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-700 hover:border-brand-500 rounded-xl p-8 text-center transition-colors group">
                <FileSpreadsheet className="w-10 h-10 text-gray-600 group-hover:text-brand-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm text-gray-300">{fileName ? fileName : "Click to upload CSV or Excel file"}</p>
                <p className="text-xs text-gray-500 mt-1">Columns: phone_number, name, company (optional)</p>
              </button>
              {parsing && <p className="text-sm text-gray-400 text-center mt-2">Parsing file...</p>}
            </div>
          )}

          {tab === "paste" && (
            <div className="space-y-2">
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm min-h-[140px] resize-none font-mono"
                placeholder="+91 9876543210&#10;+1 555 123 4567&#10;..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <button onClick={handlePasteParse}
                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                Parse Numbers
              </button>
            </div>
          )}

          {contacts.length > 0 && (
            <div>
              <p className="text-sm font-medium text-white mb-2">{contacts.length} contacts loaded</p>
              <div className="bg-gray-800 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-700/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-400">#</th>
                      <th className="px-3 py-2 text-left text-gray-400">Phone</th>
                      <th className="px-3 py-2 text-left text-gray-400">Name</th>
                      <th className="px-3 py-2 text-left text-gray-400">Company</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {contacts.slice(0, 200).map((c, i) => (
                      <tr key={i} className="hover:bg-gray-700/30">
                        <td className="px-3 py-1.5 text-gray-500">{i + 1}</td>
                        <td className="px-3 py-1.5 text-white font-mono">{c.phone_number}</td>
                        <td className="px-3 py-1.5 text-gray-300">{c.name || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-300">{c.company || "—"}</td>
                      </tr>
                    ))}
                    {contacts.length > 200 && (
                      <tr><td colSpan={4} className="px-3 py-2 text-gray-500 text-center">+{contacts.length - 200} more…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button
            onClick={handleStart}
            disabled={loading || contacts.length === 0 || !agentId}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            {loading ? "Starting..." : `Call ${contacts.length || ""} Contacts`}
          </button>
        </div>
      </div>
    </div>
  );
}
