"use client";
import { useEffect, useRef, useState } from "react";
import {
  Phone, PhoneCall, Clock, Zap, Activity, ChevronRight, ChevronLeft, Upload,
  Users, X, FileSpreadsheet, Calendar, MessageSquare, BarChart2,
  User, Globe, TrendingUp, CheckCircle2, XCircle, Mic2, ArrowUpRight,
  ArrowDownLeft, Database, Repeat, DollarSign, PhoneOff,
} from "lucide-react";
import { getCalls, getAgents, getCallDetail, initiateCall, bulkCall, getRecordingUrl, hangupCall } from "@/lib/api";
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

const STATUS_MAP: Record<string, { label: string; dot: string; text: string; bg: string; pulse?: boolean }> = {
  completed:    { label: "Completed",   dot: "bg-emerald-400",              text: "text-emerald-700", bg: "bg-emerald-50"  },
  in_progress:  { label: "Live",        dot: "bg-brand-400 animate-pulse",  text: "text-brand-700",   bg: "bg-brand-50",    pulse: true },
  ringing:      { label: "Ringing",     dot: "bg-amber-400 animate-pulse",  text: "text-amber-700",   bg: "bg-amber-50",    pulse: true },
  initiated:    { label: "Initiated",   dot: "bg-amber-400",                text: "text-amber-700",   bg: "bg-amber-50"    },
  not_answered: { label: "No Answer",   dot: "bg-neutral-400",              text: "text-neutral-600", bg: "bg-neutral-100" },
  failed:       { label: "Failed",      dot: "bg-red-400",                  text: "text-red-700",     bg: "bg-red-50"      },
  voicemail:    { label: "Voicemail",   dot: "bg-orange-400",               text: "text-orange-700",  bg: "bg-orange-50"   },
  cancelled:    { label: "Cancelled",   dot: "bg-neutral-400",              text: "text-neutral-600", bg: "bg-neutral-100" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, dot: "bg-neutral-400", text: "text-neutral-600", bg: "bg-neutral-100" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

const INTEREST_COLOR: Record<string, string> = {
  high: "text-green-600",
  medium: "text-amber-600",
  low: "text-orange-600",
  not_interested: "text-red-600",
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
//
// Designed to "just work" on whatever the user uploads — no required format.
// Phone numbers are detected anywhere in the file (any sheet, any row, any
// column, with or without a header row) and in any format:
//   7572900482 · +917572900482 · +91 7572900482 · (757) 290-0482 · 757-290-0482
// Optional name / company / email columns are picked up when a header names them.

// Normalise one cell into a phone number, or return null if it doesn't look like one.
function normalizePhone(raw: any): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Excel may hand us scientific notation for long numbers (e.g. 9.18765E+11)
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = n.toLocaleString("fullwide", { useGrouping: false });
  }
  const hasPlus = s.trimStart().startsWith("+");
  const digits = s.replace(/\D/g, "");
  // 7–15 digits covers local (10) through full E.164 international numbers
  if (digits.length < 7 || digits.length > 15) return null;
  return (hasPlus ? "+" : "") + digits;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Header-keyword detection — case/spacing/punctuation insensitive.
function classifyHeader(h: string): "phone" | "name" | "company" | "email" | null {
  const k = h.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return null;
  if (k.includes("email") || k.includes("mail")) return "email";
  if (k.includes("phone") || k.includes("mobile") || k.includes("cell") ||
      k.includes("whatsapp") || k.includes("contactno") || k.includes("contactnumber") ||
      k.includes("number") || k === "no" || k === "ph" || k === "tel" ||
      k.includes("msisdn") || k.includes("contactnum")) return "phone";
  if (k.includes("company") || k.includes("organi") || k.includes("business") ||
      k.includes("firm")) return "company";
  if (k.includes("name") || k.includes("customer") || k.includes("lead") ||
      k.includes("person") || k.includes("client")) return "name";
  return null;
}

async function parseFile(file: File): Promise<Contact[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const contacts: Contact[] = [];
  const seen = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1, defval: "", blankrows: false,
    });
    if (!rows.length) continue;

    // Try to identify a header row (one of the first rows that names columns
    // but contains no phone number itself).
    let headerIdx = -1;
    const colKind: Record<number, ReturnType<typeof classifyHeader>> = {};
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const row = rows[r] || [];
      const hasPhone = row.some((c) => normalizePhone(c));
      const labels = row.map((c) => classifyHeader(String(c ?? "")));
      if (!hasPhone && labels.some((l) => l !== null)) {
        headerIdx = r;
        labels.forEach((l, i) => { if (l) colKind[i] = l; });
        break;
      }
    }
    const colOf = (kind: string) =>
      Number(Object.keys(colKind).find((i) => colKind[+i] === kind) ?? -1);
    const phoneCol = colOf("phone");
    const nameCol = colOf("name");
    const companyCol = colOf("company");
    const emailCol = colOf("email");

    for (let r = 0; r < rows.length; r++) {
      if (r === headerIdx) continue;
      const row = rows[r];
      if (!row || !row.length) continue;

      // Find the phone: prefer the detected phone column, else scan every cell.
      let phone = phoneCol >= 0 ? normalizePhone(row[phoneCol]) : null;
      if (!phone) {
        for (const cell of row) { phone = normalizePhone(cell); if (phone) break; }
      }
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const pick = (col: number) =>
        col >= 0 && row[col] != null && String(row[col]).trim()
          ? String(row[col]).trim() : undefined;

      // Email: detected column, else any cell that looks like an email.
      let email = pick(emailCol);
      if (!email) {
        for (const cell of row) {
          const v = String(cell ?? "").trim();
          if (EMAIL_RE.test(v)) { email = v; break; }
        }
      }
      // Name: detected column, else first non-phone / non-email text cell.
      let name = pick(nameCol);
      if (!name) {
        for (const cell of row) {
          const v = String(cell ?? "").trim();
          if (v && !normalizePhone(cell) && !EMAIL_RE.test(v) && /[a-z]/i.test(v)) {
            name = v; break;
          }
        }
      }

      contacts.push({ phone_number: phone, name, company: pick(companyCol), email });
    }
  }

  return contacts;
}

function parseTextNumbers(text: string): Contact[] {
  const out: Contact[] = [];
  const seen = new Set<string>();
  for (const token of text.split(/[\n,;]+/)) {
    const phone = normalizePhone(token);
    if (phone && !seen.has(phone)) { seen.add(phone); out.push({ phone_number: phone }); }
  }
  return out;
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
  const [dialForm, setDialForm] = useState({ agent_id: "", phone_number: "", name: "" });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

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
      const payload: any = { agent_id: dialForm.agent_id, phone_number: dialForm.phone_number };
      if (dialForm.name.trim()) payload.contact_data = { name: dialForm.name.trim() };
      const call = await initiateCall(payload);
      setCalls((c: any[]) => [call, ...c]);
      setShowDial(false);
      toast.success("Call initiated!");
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      const status = err?.response?.status;
      if (status === 402) {
        toast.error(msg || "Insufficient balance. Please top up your account.");
      } else if (status === 409) {
        toast.error(msg || "A call to this number is already in progress.");
      } else {
        toast.error("Failed to initiate call");
      }
    }
  };

  const handleHangup = async (callId: string) => {
    try {
      await hangupCall(callId);
      toast.success("Call ended");
      // Refresh detail and list
      const [updated, updatedList] = await Promise.all([
        getCallDetail(callId),
        getCalls(),
      ]);
      setDetail(updated);
      setCalls(updatedList);
    } catch {
      toast.error("Failed to end call");
    }
  };

  const closeDetail = () => { setDetail(null); setDetailLoading(false); };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(calls.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedCalls = calls.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const detailOpen = !!detail || detailLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">Calls</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Monitor and review all call sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 bg-white hover:bg-neutral-50 text-neutral-700 text-sm font-medium border border-neutral-200 hover:border-neutral-300 rounded-lg shadow-xs transition-all duration-150"
          >
            <Users className="w-4 h-4" /> <span className="hidden sm:inline">Bulk Call</span>
          </button>
          <button
            onClick={() => setShowDial(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors"
          >
            <PhoneCall className="w-4 h-4" /> Dial
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ── Call list ── */}
        <div className={`lg:col-span-2 bg-white rounded-xl border border-neutral-200 shadow-sm flex-col ${detailOpen ? "hidden lg:flex" : "flex"}`}>
          <div className="px-4 py-3 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
            Call Logs ({calls.length})
          </div>
          <div className="divide-y divide-neutral-100 overflow-y-auto lg:max-h-[60vh]">
            {calls.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
                  <Phone className="w-7 h-7 text-neutral-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-neutral-500">No calls yet</p>
                  <p className="text-xs text-neutral-400 mt-1">Dial a number above to place your first call.</p>
                </div>
              </div>
            )}
            {pagedCalls.map((call: any) => {
              const isSelected = detail?.call?.id === call.id;
              return (
                <button
                  key={call.id}
                  onClick={() => openCall(call)}
                  className={`w-full px-4 py-3 text-left transition-colors ${isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
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
                        <p className="text-sm font-medium text-neutral-900 truncate font-mono">{call.phone_number}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {new Date(toUTC(call.created_at)).toLocaleDateString("en-GB", { timeZone: IST, day: "2-digit", month: "short" })}
                          {" · "}{new Date(toUTC(call.created_at)).toLocaleTimeString("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true })}
                          {call.duration_seconds ? ` · ${fmtDuration(call.duration_seconds)}` : ""}
                          {call.cost_usd != null ? ` · $${call.cost_usd.toFixed(4)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <StatusBadge status={call.status} />
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-neutral-200 mt-auto">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:pointer-events-none px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs text-neutral-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:pointer-events-none px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ── Detail panel ── */}
        <div className={`lg:col-span-3 bg-white rounded-xl border border-neutral-200 shadow-sm flex-col min-h-[400px] lg:min-h-[75vh] ${detailOpen ? "flex" : "hidden lg:flex"}`}>
          {/* Mobile back button */}
          {detailOpen && (
            <button
              onClick={closeDetail}
              className="lg:hidden flex items-center gap-1.5 px-4 py-3 border-b border-neutral-200 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to call logs
            </button>
          )}

          {detailLoading && (
            <div className="flex items-center justify-center flex-1 py-20">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!detailLoading && !detail && (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
              <Phone className="w-12 h-12 text-neutral-300 mb-3" />
              <p className="text-neutral-500 text-sm">Select a call to view full details</p>
            </div>
          )}

          {!detailLoading && detail && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="px-3 sm:px-5 py-4 border-b border-neutral-200 flex-shrink-0">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div>
                    <div className="flex items-start gap-2 mb-2">
                      <User className="w-4 h-4 text-neutral-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-neutral-900 text-lg break-words">
                          {detail.contact?.name || "Unknown Caller"}
                        </p>
                        {detail.contact?.company && (
                          <p className="text-sm text-neutral-500 mt-0.5 break-words">{detail.contact.company}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-2 flex-wrap">
                      <span className="text-sm text-neutral-500 font-mono break-all">{detail.call.phone_number}</span>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={detail.call.status} />
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          detail.call.direction === "outbound"
                            ? "bg-brand-500/10 text-brand-400"
                            : "bg-green-500/10 text-green-400"
                        }`}>
                          {detail.call.direction === "outbound" ? "↑ Outbound" : "↓ Inbound"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200">
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <p className="text-xs text-neutral-500 mb-0.5">Start</p>
                        <p className="text-neutral-900 font-medium">{fmtDate(detail.call.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 mb-0.5">Duration</p>
                        <p className="text-neutral-900 font-medium">{fmtDuration(detail.call.duration_seconds)}</p>
                      </div>
                    </div>
                    {["initiated", "ringing", "in_progress"].includes(detail.call.status) && (
                      <button
                        onClick={() => handleHangup(detail.call.id)}
                        className="flex items-center justify-center sm:justify-start gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        <PhoneOff className="w-3.5 h-3.5" /> Hang Up
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
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
                      detail.call.sentiment_score == null ? "text-neutral-400" :
                      detail.call.sentiment_score >= 0.7 ? "text-green-400" :
                      detail.call.sentiment_score >= 0.4 ? "text-yellow-400" : "text-red-400"
                    }
                  />
                  <StatChip
                    icon={<DollarSign className="w-3 h-3" />}
                    label="Cost"
                    value={detail.call.cost_usd != null ? `$${detail.call.cost_usd.toFixed(4)}` : "—"}
                    valueClass={detail.call.cost_usd != null ? "text-amber-600" : "text-neutral-400"}
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
                    valueClass={detail.call.extra_data?.appointment_booked ? "text-green-600" : "text-neutral-400"}
                  />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-neutral-200 flex-shrink-0 overflow-x-auto">
                {(["overview", "transcript", "data"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? "border-brand-500 text-neutral-900"
                        : "border-transparent text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    {tab === "overview" ? "Overview" : tab === "transcript" ? "Transcript" : "Extracted Data"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">

                {/* ── OVERVIEW TAB ── */}
                {activeTab === "overview" && (
                  <div className="space-y-3 sm:space-y-4">
                    {/* Summary */}
                    {detail.call.summary && (
                      <Section icon={<MessageSquare className="w-4 h-4 text-brand-400" />} title="Summary">
                        <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed break-words">{detail.call.summary}</p>
                      </Section>
                    )}

                    {/* Appointment */}
                    {detail.call.extra_data?.appointment_booked && (
                      <Section icon={<Calendar className="w-4 h-4 text-green-400" />} title="Appointment Booked">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs sm:text-sm text-neutral-900 font-medium break-words">
                            {detail.call.extra_data.appointment_datetime
                              ? fmtDateTime(detail.call.extra_data.appointment_datetime)
                              : "Appointment booked — time not specified"}
                          </p>
                        </div>
                      </Section>
                    )}

                    {/* Agent + call info */}
                    <Section icon={<Zap className="w-4 h-4 text-purple-400" />} title="Call Info">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2">
                        <InfoRow label="Agent" value={detail.agent?.name || "—"} />
                        <InfoRow label="Pipeline" value={detail.call.pipeline_mode} />
                        <InfoRow label="Start time" value={fmtDate(detail.call.started_at)} />
                        <InfoRow label="End time" value={fmtDate(detail.call.ended_at)} />
                        <InfoRow label="Languages" value={(detail.agent?.languages || ["English"]).join(", ")} />
                        <InfoRow label="Language used" value={detail.call.extra_data?.language_used || "—"} />
                        <InfoRow
                          label="Ended by"
                          value={detail.call.extra_data?.ended_by === "caller" ? "Caller" : detail.call.extra_data?.ended_by === "agent" ? "Agent" : "—"}
                          valueClass={detail.call.extra_data?.ended_by === "caller" ? "text-orange-600" : detail.call.extra_data?.ended_by === "agent" ? "text-blue-600" : "text-neutral-400"}
                        />
                      </div>
                    </Section>

                    {/* Caller profile */}
                    <Section icon={<User className="w-4 h-4 text-blue-400" />} title="Caller Profile">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2">
                        <InfoRow label="Name" value={detail.contact?.name || detail.call.extra_data?.caller_name || "—"} />
                        <InfoRow label="Phone" value={detail.contact?.phone_number || detail.call.phone_number} mono />
                        <InfoRow label="Email" value={detail.contact?.email || "—"} />
                        <InfoRow label="Company" value={detail.contact?.company || "—"} />
                        <InfoRow
                          label="Interest level"
                          value={detail.call.extra_data?.caller_interest || "—"}
                          valueClass={INTEREST_COLOR[detail.call.extra_data?.caller_interest || ""] || "text-neutral-700"}
                        />
                        <InfoRow label="Next steps" value={detail.call.extra_data?.next_steps || "—"} />
                      </div>
                    </Section>

                    {/* Call history */}
                    {detail.call_history?.length > 0 && (
                      <Section icon={<Repeat className="w-4 h-4 text-orange-400" />} title={`Call History (${detail.contact?.total_calls} total)`}>
                        <div className="space-y-1.5 overflow-x-auto">
                          {detail.call_history.map((h: any) => (
                            <div key={h.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-neutral-50 rounded-lg px-2 sm:px-3 py-2 gap-2 min-w-[250px]">
                              <div className="flex items-center gap-2 min-w-0">
                                {h.direction === "outbound"
                                  ? <ArrowUpRight className="w-3 h-3 text-brand-400 flex-shrink-0" />
                                  : <ArrowDownLeft className="w-3 h-3 text-green-400 flex-shrink-0" />}
                                <span className="text-xs text-neutral-500 truncate">{fmtDate(h.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-3">
                                {h.duration_seconds && (
                                  <span className="text-xs text-neutral-400">{fmtDuration(h.duration_seconds)}</span>
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
                  <div className="space-y-2 overflow-x-hidden">
                    {detail.turns.length === 0 && (
                      <p className="text-neutral-500 text-xs sm:text-sm text-center py-10">No transcript available</p>
                    )}
                    {detail.turns.map((turn: any, idx: number) => (
                      <div key={turn.id}>
                        {/* Transfer divider */}
                        {turn.from_transfer && (idx === 0 || !detail.turns[idx - 1].from_transfer) && (
                          <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 border-t border-orange-500/40" />
                            <span className="text-xs text-orange-400 font-medium px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 whitespace-nowrap">
                              Call Transferred
                            </span>
                            <div className="flex-1 border-t border-orange-500/40" />
                          </div>
                        )}
                        <div
                          className={`rounded-lg p-2 sm:p-3 ${
                            turn.from_transfer
                              ? turn.role === "user"
                                ? "bg-neutral-100 sm:ml-6 border border-orange-500/10"
                                : "bg-orange-500/10 border border-orange-500/20 sm:mr-6"
                              : turn.role === "user"
                              ? "bg-neutral-100 sm:ml-6"
                              : "bg-brand-500/10 border border-brand-500/20 sm:mr-6"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1 mb-1">
                            <span className={`text-xs font-semibold whitespace-nowrap ${
                              turn.from_transfer
                                ? turn.role === "user" ? "text-neutral-500" : "text-orange-400"
                                : turn.role === "user" ? "text-neutral-500" : "text-brand-400"
                            }`}>
                              {turn.from_transfer
                                ? turn.role === "user" ? "Caller" : "Human Agent"
                                : turn.role === "user" ? "Caller" : "Agent"}
                            </span>
                            {turn.sentiment && (
                              <span className="text-xs text-neutral-400">· {turn.sentiment}</span>
                            )}
                            {turn.created_at && (
                              <span className="text-xs text-neutral-400 ml-auto sm:ml-0">{fmtTime(turn.created_at)}</span>
                            )}
                            {turn.latency_ms && (
                              <span className="text-xs text-neutral-400 flex items-center gap-0.5 whitespace-nowrap">
                                <Clock className="w-3 h-3" />{turn.latency_ms}ms
                              </span>
                            )}
                            {turn.from_prediction_cache && (
                              <span className="text-xs text-green-400 flex items-center gap-0.5 whitespace-nowrap">
                                <Zap className="w-3 h-3" />cached
                              </span>
                            )}
                          </div>
                          <p className="text-xs sm:text-sm text-neutral-700 break-words">{turn.transcript || "(audio only)"}</p>
                          {turn.eval_score != null && (
                            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                              <Activity className="w-3 h-3 text-neutral-500 flex-shrink-0" />
                              <span className={`text-xs ${
                                turn.eval_score >= 7 ? "text-green-400" :
                                turn.eval_score >= 5 ? "text-yellow-400" : "text-red-400"
                              }`}>score: {turn.eval_score.toFixed(1)}</span>
                              {turn.eval_feedback && (
                                <span className="text-xs text-neutral-400 break-words"> — {turn.eval_feedback}</span>
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
                  <div className="space-y-3 sm:space-y-4">
                    {/* Key points */}
                    {Array.isArray(detail.call.extra_data?.key_points) && detail.call.extra_data.key_points.length > 0 && (
                      <Section icon={<BarChart2 className="w-4 h-4 text-brand-400" />} title="Key Points">
                        <ul className="space-y-1.5">
                          {detail.call.extra_data.key_points.map((pt: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-neutral-700">
                              <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                              <span className="break-words">{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    {/* Appointment */}
                    <Section icon={<Calendar className="w-4 h-4 text-green-400" />} title="Appointment">
                      <div className="flex items-start gap-3">
                        {detail.call.extra_data?.appointment_booked
                          ? <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                          : <XCircle className="w-5 h-5 text-neutral-500 flex-shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 break-words">
                            {detail.call.extra_data?.appointment_booked ? "Appointment booked" : "No appointment booked"}
                          </p>
                          {detail.call.extra_data?.appointment_datetime && (
                            <p className="text-xs text-green-400 mt-0.5 break-words">
                              {fmtDateTime(detail.call.extra_data.appointment_datetime)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Section>

                    {/* Caller info extracted */}
                    <Section icon={<User className="w-4 h-4 text-blue-400" />} title="Extracted Caller Info">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2">
                        <InfoRow label="Name" value={detail.call.extra_data?.caller_name || "—"} />
                        <InfoRow
                          label="Interest"
                          value={detail.call.extra_data?.caller_interest || "—"}
                          valueClass={INTEREST_COLOR[detail.call.extra_data?.caller_interest || ""] || "text-neutral-700"}
                        />
                        <InfoRow label="Next steps" value={detail.call.extra_data?.next_steps || "—"} />
                        <InfoRow label="Language used" value={detail.call.extra_data?.language_used || "—"} />
                      </div>
                    </Section>

                    {/* Sentiment */}
                    <Section icon={<TrendingUp className="w-4 h-4 text-pink-400" />} title="Sentiment & Emotions">
                      <div className="space-y-2 overflow-hidden">
                        {detail.call.sentiment_score != null && (() => {
                          const pct = Math.min(100, Math.round((detail.call.sentiment_score / 10) * 100));
                          return (
                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                <span className="text-xs text-neutral-500">Overall positivity</span>
                                <span className={`text-sm font-bold ${
                                  pct >= 70 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-red-400"
                                }`}>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
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
                            const isPerTurn = entries.some(([, v]) => v !== null && typeof v === "object");
                            if (isPerTurn) {
                              const turnCount = entries.length;
                              const emotions: string[] = Array.from(new Set(
                                entries.map(([, v]: any) => v?.emotion).filter(Boolean)
                              ));
                              const avgEngagement = entries.reduce((s, [, v]: any) => s + (v?.engagement ?? 0), 0) / turnCount;
                              return (
                                <div className="mt-2 space-y-2">
                                  <p className="text-xs text-neutral-400">{turnCount} turns analyzed</p>
                                  <div className="flex flex-wrap gap-1">
                                    {emotions.map((e) => (
                                      <span key={e} className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full capitalize whitespace-nowrap">{e}</span>
                                    ))}
                                    <span className="text-xs bg-neutral-100 text-neutral-500 px-2 py-1 rounded-full whitespace-nowrap">
                                      engagement {Math.round(avgEngagement * 100)}%
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {entries.map(([k, v]: any) => (
                                  <span key={k} className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded-full capitalize whitespace-nowrap">
                                    {k}: {typeof v === "number" ? `${Math.round(v * 100)}%` : String(v ?? "")}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                      </div>
                    </Section>

                    {/* Recording */}
                    <Section icon={<Mic2 className="w-4 h-4 text-neutral-400" />} title="Recording">
                      {detail.call.has_recording ? (
                        <div className="overflow-x-auto">
                          <CallAudioPlayer src={getRecordingUrl(detail.call.id)} />
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-neutral-500 break-words">
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
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-lg w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Initiate Call</h2>
              <button onClick={() => setShowDial(false)} className="text-neutral-400 hover:text-neutral-900"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm text-neutral-700">Agent</label>
                <select
                  className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                  value={dialForm.agent_id}
                  onChange={e => setDialForm(f => ({ ...f, agent_id: e.target.value }))}
                >
                  <option value="">Select agent...</option>
                  {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-neutral-700">Phone Number</label>
                <input
                  className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                  placeholder="+1234567890"
                  value={dialForm.phone_number}
                  onChange={e => setDialForm(f => ({ ...f, phone_number: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-neutral-700">Name <span className="text-neutral-400 font-normal">(optional)</span></label>
                <input
                  className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                  placeholder="e.g. Ravi — fills [Customer Name] in the prompt"
                  value={dialForm.name}
                  onChange={e => setDialForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-3">
              <button onClick={() => setShowDial(false)} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
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
    <div className="bg-neutral-50 rounded-lg px-2.5 sm:px-3 py-2 min-w-0">
      <div className="flex items-center gap-1 text-neutral-500 mb-0.5 min-w-0">
        {icon}
        <span className="text-[9px] sm:text-[10px] uppercase tracking-wide truncate">{label}</span>
      </div>
      <p className={`text-xs sm:text-sm font-semibold ${valueClass || "text-neutral-900"} break-words`}>{value}</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-50 rounded-xl p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {icon}
        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide truncate">{title}</h3>
      </div>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] sm:text-[10px] text-neutral-500 uppercase tracking-wide truncate">{label}</p>
      <p className={`text-xs sm:text-sm mt-0.5 ${mono ? "font-mono" : ""} ${valueClass || "text-neutral-700"} break-words`}>{value}</p>
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
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-lg w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Bulk Call Campaign</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Upload CSV/Excel or paste numbers</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-neutral-700 font-medium">Agent</label>
              <select
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
              >
                <option value="">Select agent...</option>
                {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-neutral-700 font-medium">Calls/second</label>
              <input type="number" min={0.1} max={5} step={0.5}
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                value={callsPerSecond}
                onChange={e => setCallsPerSecond(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex gap-2 border-b border-neutral-200">
            {(["file", "paste"] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setContacts([]); setFileName(""); setPasteText(""); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-brand-500 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}>
                {t === "file" ? "Upload File" : "Paste Numbers"}
              </button>
            ))}
          </div>

          {tab === "file" && (
            <div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-neutral-300 hover:border-brand-500 rounded-xl p-8 text-center transition-colors group">
                <FileSpreadsheet className="w-10 h-10 text-neutral-400 group-hover:text-brand-400 mx-auto mb-2 transition-colors" />
                <p className="text-sm text-neutral-700">{fileName ? fileName : "Click to upload CSV or Excel file"}</p>
                <p className="text-xs text-neutral-500 mt-1">Any layout works — we auto-detect phone numbers (name, company, email picked up if present)</p>
              </button>
              {parsing && <p className="text-sm text-neutral-500 text-center mt-2">Parsing file...</p>}
            </div>
          )}

          {tab === "paste" && (
            <div className="space-y-2">
              <textarea
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm min-h-[140px] resize-none font-mono"
                placeholder="+91 9876543210&#10;+1 555 123 4567&#10;..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <button onClick={handlePasteParse}
                className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm">
                Parse Numbers
              </button>
            </div>
          )}

          {contacts.length > 0 && (
            <div>
              <p className="text-sm font-medium text-neutral-900 mb-2">{contacts.length} contacts loaded</p>
              <div className="bg-neutral-50 rounded-lg overflow-hidden max-h-40 overflow-y-auto border border-neutral-200">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-neutral-500">#</th>
                      <th className="px-3 py-2 text-left text-neutral-500">Phone</th>
                      <th className="px-3 py-2 text-left text-neutral-500">Name</th>
                      <th className="px-3 py-2 text-left text-neutral-500">Company</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {contacts.slice(0, 200).map((c, i) => (
                      <tr key={i} className="hover:bg-neutral-100">
                        <td className="px-3 py-1.5 text-neutral-400">{i + 1}</td>
                        <td className="px-3 py-1.5 text-neutral-900 font-mono">{c.phone_number}</td>
                        <td className="px-3 py-1.5 text-neutral-600">{c.name || "—"}</td>
                        <td className="px-3 py-1.5 text-neutral-600">{c.company || "—"}</td>
                      </tr>
                    ))}
                    {contacts.length > 200 && (
                      <tr><td colSpan={4} className="px-3 py-2 text-neutral-500 text-center">+{contacts.length - 200} more…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
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
