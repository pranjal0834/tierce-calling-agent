"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Users, Phone, Bot, RefreshCw,
  ToggleLeft, ToggleRight, Plus, Minus, ChevronDown, ChevronUp,
  Megaphone, Send, Trash2, AlertTriangle, X, Play, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, getAdminRecordingUrl } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Checkbox } from "./Checkbox";

// ── Shared API helpers ────────────────────────────────────────────────────────

export const adminGet  = (path: string, config?: { params?: Record<string, string | number | boolean | undefined> }) =>
  api.get(`/api/admin${path}`, config || {}).then(r => r.data);
export const adminPost = (path: string, body: unknown) => api.post(`/api/admin${path}`, body).then(r => r.data);
export const adminPut  = (path: string, body: unknown) => api.put(`/api/admin${path}`, body).then(r => r.data);
export const adminDelete = (path: string) => api.delete(`/api/admin${path}`).then(r => r.data);

// Convert an array of objects to a CSV file and trigger a browser download.
export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export function ExportButton({ rows, filename }: { rows: Record<string, unknown>[]; filename: string }) {
  return (
    <button onClick={() => exportCsv(filename, rows)} disabled={!rows.length}
      className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">
      <Download className="icon-sm" /> Export CSV
    </button>
  );
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface Stats {
  total_workspaces: number; total_users: number; total_calls: number;
  total_agents: number; total_revenue_usd: number;
  calls_last_24h: number; new_workspaces_7d: number;
}
export interface WsRow {
  id: string; name: string; plan: string; is_active: boolean;
  credits_balance: number; member_count: number; call_count: number;
  agent_count: number; total_purchased_minutes: number; created_at: string;
}
export interface WsDetail {
  id: string; name: string; plan: string; is_active: boolean;
  credits_balance: number; created_at: string;
  members: { id: string; email: string; role: string; is_active: boolean }[];
  agents: { id: string; name: string; pipeline_mode: string; is_active: boolean }[];
  recent_calls: { id: string; phone_number: string; status: string; duration_seconds?: number; created_at: string }[];
  transactions: { id: string; type: string; minutes: number; balance_after: number; description: string; amount_paid?: number; currency?: string; created_at: string }[];
}
export interface UserRow {
  id: string; email: string; role: string; is_active: boolean;
  workspace_id: string; workspace_name: string; created_at: string;
  deleted_at?: string | null; days_left?: number | null;
}
export interface CallRow {
  id: string; workspace_name: string; phone_number: string;
  direction: string; status: string; duration_seconds?: number;
  pipeline_mode: string; created_at: string;
  has_recording?: boolean;
  cost_usd?: number | null;
  cost_breakdown?: {
    realtime_usd?: number | null; auxiliary_usd?: number | null;
    audio_in_usd?: number | null; audio_out_usd?: number | null;
    text_in_usd?: number | null; text_out_usd?: number | null;
    transcription_usd?: number | null;
    auxiliary?: Record<string, { usd?: number; calls?: number }>;
  };
}
export interface CostData {
  range_days: number;
  usd_to_inr: number;
  total_calls: number; total_minutes: number;
  total_cost_usd: number; realtime_cost_usd: number; auxiliary_cost_usd: number;
  kb_ingestion_usd?: number; grand_total_cost_usd?: number;
  avg_cost_per_call_usd: number; avg_cost_per_min_usd: number;
  revenue_usd: number; gross_margin_usd: number;
  auxiliary_components: { name: string; usd: number; calls: number }[];
  top_workspaces: { workspace: string; cost_usd: number; calls: number; revenue_usd?: number; margin_usd?: number }[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// Page heading used across admin routes
export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// Tiny inline-SVG sparkline — no chart lib, cheap to render in a KPI card.
export function Sparkline({ data, color = "#f59e0b" }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const w = 52, h = 18;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// KPI card — tinted icon chip, light palette. Optional `spark` + `delta`
// (week-over-week %) turn it into a trend card.
export function KpiStat({ label, value, icon: Icon, sub, tint, spark, delta, href }: {
  label: string; value: string | number; icon: React.ElementType; sub?: string; tint: string;
  spark?: number[]; delta?: number | null; href?: string;
}) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const up = (delta ?? 0) >= 0;
  const content = (
    <div className={`bg-white border border-neutral-200 rounded-xl shadow-xs px-4 py-3.5 min-w-0 transition-all ${href ? "hover:border-brand-300 hover:shadow-sm" : ""}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 truncate">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tint}`}>
          <Icon className="icon-xs" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-1.5">
        <div className="text-[22px] font-semibold text-neutral-900 tracking-tight leading-none">{value}</div>
        {spark && spark.length > 1 && <Sparkline data={spark} color={up ? "#059669" : "#dc2626"} />}
      </div>
      {hasDelta ? (
        <p className="text-[11px] mt-1.5 flex items-center gap-1 truncate">
          <span className={up ? "text-success-600 font-semibold" : "text-error-600 font-semibold"}>
            {up ? "↑" : "↓"}{Math.abs(delta as number).toFixed(0)}%
          </span>
          <span className="text-neutral-400">vs last wk</span>
        </p>
      ) : sub ? (
        <p className="text-[11px] text-neutral-400 mt-1.5 truncate">{sub}</p>
      ) : null}
    </div>
  );
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "emerald" | "amber" | "blue" | "red" }) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    emerald: "bg-success-50 text-success-700",
    amber:   "bg-warning-50 text-warning-700",
    blue:    "bg-info-50 text-info-700",
    red:     "bg-error-50 text-error-700",
  };
  return <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${tones[tone]}`}>{children}</span>;
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-3">{children}</p>;
}

export function LoadingBlock() {
  return <div className="flex items-center justify-center py-20"><RefreshCw className="icon-lg text-neutral-400 animate-spin" /></div>;
}

// ── Workspace row with expandable detail ──────────────────────────────────────

export function WorkspaceRow({ ws, onRefresh, selected, onToggleSelect }: {
  ws: WsRow;
  onRefresh: () => void;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<WsDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adjMinutes, setAdjMinutes] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function expand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      try { setDetail(await adminGet(`/workspaces/${ws.id}`)); }
      catch { toast.error("Failed to load workspace detail"); }
      finally { setLoadingDetail(false); }
    }
  }

  async function adjustCredits(sign: 1 | -1) {
    const mins = parseFloat(adjMinutes);
    if (!mins || isNaN(mins)) { toast.error("Enter valid minutes"); return; }
    setAdjusting(true);
    try {
      const res = await adminPost(`/workspaces/${ws.id}/credits`, { minutes: sign * mins, reason: adjReason });
      toast.success(`Balance updated: ${res.new_balance.toFixed(1)} min`);
      setAdjMinutes(""); setAdjReason("");
      setDetail(null);
      onRefresh();
    } catch { toast.error("Failed to adjust credits"); }
    finally { setAdjusting(false); }
  }

  async function handlePreset(minutes: number) {
    setAdjusting(true);
    try {
      const res = await adminPost(`/workspaces/${ws.id}/credits`, { minutes, reason: "" });
      toast.success(`Balance updated: ${res.new_balance.toFixed(1)} min`);
      setDetail(null);
      onRefresh();
    } catch { toast.error("Failed to adjust credits"); }
    finally { setAdjusting(false); }
  }

  async function toggleStatus() {
    setToggling(true);
    try {
      await adminPut(`/workspaces/${ws.id}/status`, { is_active: !ws.is_active });
      toast.success(`Workspace ${ws.is_active ? "disabled" : "enabled"}`);
      onRefresh();
    } catch { toast.error("Failed to update status"); }
    finally { setToggling(false); }
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden transition-colors">
      <div className="flex items-center gap-3 pl-5 pr-3 py-3.5 hover:bg-neutral-50 transition-colors">
        {onToggleSelect && (
          <Checkbox checked={!!selected} onChange={() => onToggleSelect()} />
        )}
        <button
          type="button"
          onClick={expand}
          aria-expanded={expanded}
          aria-label={`${ws.name} — ${expanded ? "collapse" : "expand"} details`}
          className="flex flex-1 items-center gap-4 min-w-0 text-left cursor-pointer"
        >
          <span aria-hidden className={`w-2 h-2 rounded-full flex-shrink-0 ${ws.is_active ? "bg-success-400" : "bg-neutral-300"}`} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-neutral-900 truncate">{ws.name}</span>
            <span className="block text-xs text-neutral-400">{fmt(ws.created_at)}</span>
          </span>
          <span className="hidden sm:flex items-center gap-5 text-xs text-neutral-500">
            <span title="Members"><Users className="icon-xs inline mr-1 text-neutral-400" />{ws.member_count}</span>
            <span title="Agents"><Bot className="icon-xs inline mr-1 text-neutral-400" />{ws.agent_count}</span>
            <span title="Calls"><Phone className="icon-xs inline mr-1 text-neutral-400" />{ws.call_count}</span>
            <span title="Balance" className={`font-medium ${ws.credits_balance <= 0 ? "text-error-500" : "text-success-600"}`}>{ws.credits_balance.toFixed(1)} min</span>
          </span>
          <Pill tone={ws.is_active ? "emerald" : "neutral"}>{ws.is_active ? "Active" : "Disabled"}</Pill>
          {expanded ? <ChevronUp className="icon-sm text-neutral-400 flex-shrink-0" /> : <ChevronDown className="icon-sm text-neutral-400 flex-shrink-0" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50 p-5 space-y-5">
          {loadingDetail ? (
            <div className="flex justify-center py-6"><RefreshCw className="icon-lg text-neutral-400 animate-spin" /></div>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={toggleStatus} disabled={toggling}
                  className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                    ws.is_active ? "text-error-600 border-error-200 hover:bg-error-50" : "text-success-600 border-success-200 hover:bg-success-50"
                  }`}
                >
                  {ws.is_active ? <ToggleRight className="icon-sm" /> : <ToggleLeft className="icon-sm" />}
                  {ws.is_active ? "Disable workspace" : "Enable workspace"}
                </button>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
                <CardLabel>Quick Presets</CardLabel>
                <div className="flex flex-wrap gap-1.5">
                  {[100, 500, 1000, 60, 300].map(amt => {
                    const label = amt >= 60 && amt % 60 === 0 ? `+${amt / 60}h` : `+${amt}`;
                    return (
                      <button key={amt} onClick={() => handlePreset(amt)} disabled={adjusting}
                        className="px-3 h-7 text-xs font-medium bg-success-50 hover:bg-success-100 text-success-700 rounded-md transition-colors disabled:opacity-50">
                        {label}
                      </button>
                    );
                  })}
                  {[100, 500, 1000, 60, 300].map(amt => {
                    const label = amt >= 60 && amt % 60 === 0 ? `-${amt / 60}h` : `-${amt}`;
                    return (
                      <button key={`neg-${amt}`} onClick={() => handlePreset(-amt)} disabled={adjusting}
                        className="px-3 h-7 text-xs font-medium bg-error-50 hover:bg-error-100 text-error-700 rounded-md transition-colors disabled:opacity-50">
                        {label}
                      </button>
                    );
                  })}
                </div>
                <CardLabel>Custom Adjustment</CardLabel>
                <div className="flex flex-wrap gap-2">
                  <input type="number" placeholder="Minutes" value={adjMinutes} onChange={e => setAdjMinutes(e.target.value)}
                    className="w-28 bg-white border border-neutral-200 rounded-lg px-3 h-9 text-neutral-900 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
                  <input type="text" placeholder="Reason (optional)" value={adjReason} onChange={e => setAdjReason(e.target.value)}
                    className="flex-1 min-w-[8rem] bg-white border border-neutral-200 rounded-lg px-3 h-9 text-neutral-900 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
                  <button onClick={() => adjustCredits(1)} disabled={adjusting}
                    className="inline-flex items-center gap-1 px-3 h-9 bg-success-600 hover:bg-success-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                  <button onClick={() => adjustCredits(-1)} disabled={adjusting}
                    className="inline-flex items-center gap-1 px-3 h-9 bg-white border border-error-200 text-error-600 hover:bg-error-50 text-xs font-medium rounded-lg disabled:opacity-50">
                    <Minus className="icon-xs" /> Deduct
                  </button>
                </div>
                <p className="text-xs text-neutral-500">Current balance: <span className="text-neutral-900 font-medium">{detail.credits_balance.toFixed(1)} min</span></p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <CardLabel>Members ({detail.members.length})</CardLabel>
                  <div className="space-y-2">
                    {detail.members.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-neutral-700 truncate">{m.email}</span>
                        <Pill tone={m.role === "owner" ? "amber" : "blue"}>{m.role}</Pill>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <CardLabel>Agents ({detail.agents.length})</CardLabel>
                  <div className="space-y-2">
                    {detail.agents.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-neutral-700 truncate">{a.name}</span>
                        <span className="text-neutral-400">{a.pipeline_mode}</span>
                      </div>
                    ))}
                    {detail.agents.length === 0 && <p className="text-neutral-400 text-xs">No agents</p>}
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">Recent Calls</p>
                    <Link href={`/admin/calls?search=${encodeURIComponent(ws.name)}`} className="text-[11px] font-medium text-brand-600 hover:text-brand-700">
                      View all calls →
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {detail.recent_calls.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-neutral-700 truncate">{c.phone_number}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.duration_seconds ? <span className="text-neutral-400">{c.duration_seconds}s</span> : null}
                          <Pill tone={c.status === "completed" ? "emerald" : "neutral"}>{c.status}</Pill>
                        </div>
                      </div>
                    ))}
                    {detail.recent_calls.length === 0 && <p className="text-neutral-400 text-xs">No calls yet</p>}
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <CardLabel>Billing Transactions</CardLabel>
                  <div className="space-y-2">
                    {detail.transactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-neutral-700 truncate max-w-[160px]">{t.description || t.type}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {t.amount_paid ? <span className="text-neutral-400">{t.currency === "INR" ? "₹" : "$"}{t.amount_paid}</span> : null}
                          <span className={`font-medium ${t.minutes >= 0 ? "text-success-600" : "text-error-500"}`}>{t.minutes >= 0 ? "+" : ""}{t.minutes.toFixed(1)}m</span>
                        </div>
                      </div>
                    ))}
                    {detail.transactions.length === 0 && <p className="text-neutral-400 text-xs">No transactions</p>}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Admin call row with cost breakdown ────────────────────────────────────────

function CostLine({ label, v, bold, accent, sub }: { label: string; v?: number | null; bold?: boolean; accent?: boolean; sub?: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className={bold ? "text-neutral-700 font-medium" : "text-neutral-500"}>
        {label}{sub && <span className="text-neutral-400 ml-1">{sub}</span>}
      </span>
      <span className={accent ? "text-warning-600 font-semibold" : bold ? "text-neutral-900 font-medium" : "text-neutral-600"}>
        {v != null ? `$${Number(v).toFixed(4)}` : "—"}
      </span>
    </div>
  );
}

export function AdminCallRow({ c }: { c: CallRow }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const cb = c.cost_breakdown;
  const hasCost = c.cost_usd != null && c.cost_usd > 0;
  const auxEntries = cb?.auxiliary ? Object.entries(cb.auxiliary) : [];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-3">
        <div aria-hidden className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "in_progress" ? "bg-brand-400 animate-pulse" : c.status === "completed" ? "bg-success-400" : "bg-warning-400"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-900 truncate">{c.phone_number}</p>
          <p className="text-xs text-neutral-400 truncate">{c.workspace_name} · {c.pipeline_mode}</p>
        </div>
        <span className="text-xs text-neutral-400 hidden sm:inline capitalize">{c.direction}</span>
        {c.duration_seconds ? <span className="text-xs text-neutral-500">{c.duration_seconds}s</span> : null}
        {hasCost
          ? <span className="text-xs font-medium text-warning-700 bg-warning-50 rounded px-1.5 py-0.5">${c.cost_usd!.toFixed(4)}</span>
          : <span className="text-xs text-neutral-300">—</span>}
        <Pill tone={c.status === "completed" ? "emerald" : "neutral"}>{c.status}</Pill>
        <span className="text-xs text-neutral-400 hidden md:inline">{fmt(c.created_at)}</span>
        {c.has_recording && (
          <button onClick={() => setPlaying(p => !p)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors ${playing ? "text-brand-600 bg-brand-50" : "text-neutral-400 hover:text-brand-600 hover:bg-brand-50"}`}
            title="Play recording">
            <Play className="icon-sm" />
          </button>
        )}
        <button onClick={() => setOpen(o => !o)} disabled={!hasCost}
          aria-expanded={open} aria-label={hasCost ? "Toggle cost breakdown" : "No cost recorded"}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-default flex-shrink-0"
          title={hasCost ? "Cost breakdown" : "No cost recorded"}>
          {open ? <ChevronUp className="icon-sm" /> : <ChevronDown className="icon-sm" />}
        </button>
      </div>

      {playing && c.has_recording && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3">
          <audio controls autoPlay src={getAdminRecordingUrl(c.id)} className="w-full h-9" />
        </div>
      )}

      {open && hasCost && cb && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <CardLabel>Realtime audio</CardLabel>
            <CostLine label="Audio in" v={cb.audio_in_usd} />
            <CostLine label="Audio out" v={cb.audio_out_usd} />
            <CostLine label="Text in" v={cb.text_in_usd} />
            <CostLine label="Text out" v={cb.text_out_usd} />
            <CostLine label="Transcription (Whisper)" v={cb.transcription_usd} />
            <CostLine label="Realtime subtotal" v={cb.realtime_usd} bold />
          </div>
          <div>
            <CardLabel>Auxiliary models</CardLabel>
            {auxEntries.length === 0
              ? <p className="text-xs text-neutral-400">No auxiliary cost recorded (call predates cost tracking).</p>
              : auxEntries.map(([name, comp]) => (
                  <CostLine key={name} label={name.replace(/_/g, " ")} v={comp?.usd} sub={comp?.calls ? `${comp.calls}×` : undefined} />
                ))}
            <CostLine label="Auxiliary subtotal" v={cb.auxiliary_usd} bold />
            <CostLine label="Grand total" v={c.cost_usd} bold accent />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

export function DeleteConfirmModal({ email, onConfirm, onCancel, loading }: {
  email: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title">
      <div ref={trapRef} className="bg-white rounded-2xl border border-neutral-200 shadow-modal w-full max-w-sm animate-scale-in">
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="w-10 h-10 bg-error-50 border border-error-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="icon-lg text-error-500" />
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="icon-sm" />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 id="admin-delete-title" className="text-[15px] font-semibold text-neutral-900 mb-1.5">Delete account</h2>
          <p className="text-sm text-neutral-500 mb-1">You are about to delete:</p>
          <p className="text-sm font-semibold text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-4 font-mono break-all">{email}</p>
          <div className="bg-warning-50 border border-warning-200 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-warning-700 leading-relaxed">
              The account is deactivated and its email freed immediately. You can restore it from
              <span className="font-semibold"> Recently Deleted</span> for <span className="font-semibold">30 days</span> — after that it's permanently purged.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={loading}
              className="flex-1 h-10 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-sm font-medium text-neutral-600 rounded-xl transition-all disabled:opacity-50">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 h-10 bg-error-500 hover:bg-error-600 text-white text-sm font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
              {loading ? (<><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Deleting…</>) : (<><Trash2 className="icon-xs" /> Delete Account</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Announcement panel ────────────────────────────────────────────────────────

export function AnnouncementPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", headline: "", body: "", cta_label: "", cta_url: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  // Inline field validation — required fields + CTA URL format (when provided).
  const errors: Record<string, string> = {};
  if (!form.subject.trim()) errors.subject = "Subject is required";
  if (!form.headline.trim()) errors.headline = "Headline is required";
  if (!form.body.trim()) errors.body = "Body is required";
  if (form.cta_url.trim() && !/^https?:\/\/.+/i.test(form.cta_url.trim())) errors.cta_url = "Enter a full URL starting with http:// or https://";
  const markTouched = (field: string) => setTouched(t => ({ ...t, [field]: true }));

  const send = async () => {
    if (Object.keys(errors).length > 0) {
      setTouched({ subject: true, headline: true, body: true, cta_url: true });
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSending(true);
    try {
      const res = await api.post<{ sent: number; message: string }>("/api/notifications/announce", form);
      toast.success(res.data.message);
      setForm({ subject: "", headline: "", body: "", cta_label: "", cta_url: "" });
      setOpen(false);
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Failed to send announcement"); }
    finally { setSending(false); }
  };

  const sendTest = async () => {
    setTestSending(true);
    try {
      const res = await api.post<{ message: string }>("/api/notifications/test");
      toast.success(res.data.message);
    } catch (e: any) { toast.error(e?.response?.data?.detail || "SMTP not configured — check SMTP_* env vars"); }
    finally { setTestSending(false); }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-50 border border-brand-200 rounded-lg flex items-center justify-center">
            <Megaphone className="icon-sm text-brand-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-neutral-900">Send Announcement</p>
            <p className="text-xs text-neutral-500">Broadcast a feature update or message to all opted-in users</p>
          </div>
        </div>
        <ChevronDown className={`icon-sm text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-neutral-100 px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email-subject" className="label-base">Email Subject</label>
              <input id="email-subject" aria-invalid={!!(touched.subject && errors.subject)}
                className={`input-base ${touched.subject && errors.subject ? "border-error-300 focus:border-error-500" : ""}`}
                placeholder="🚀 New features in Vaaniq" value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} onBlur={() => markTouched("subject")} />
              {touched.subject && errors.subject && <p className="text-xs text-error-600 mt-1">{errors.subject}</p>}
            </div>
            <div>
              <label htmlFor="email-headline" className="label-base">Headline</label>
              <input id="email-headline" aria-invalid={!!(touched.headline && errors.headline)}
                className={`input-base ${touched.headline && errors.headline ? "border-error-300 focus:border-error-500" : ""}`}
                placeholder="We just shipped something exciting" value={form.headline}
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} onBlur={() => markTouched("headline")} />
              {touched.headline && errors.headline && <p className="text-xs text-error-600 mt-1">{errors.headline}</p>}
            </div>
          </div>
          <div>
            <label htmlFor="email-body" className="label-base">Body</label>
            <textarea id="email-body" aria-invalid={!!(touched.body && errors.body)}
              className={`input-base min-h-[100px] resize-none ${touched.body && errors.body ? "border-error-300 focus:border-error-500" : ""}`}
              placeholder="Describe what's new, what changed, or any important update…" value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))} onBlur={() => markTouched("body")} />
            {touched.body && errors.body && <p className="text-xs text-error-600 mt-1">{errors.body}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email-cta-label" className="label-base">CTA Button Label <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input id="email-cta-label" className="input-base" placeholder="Try it now" value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="email-cta-url" className="label-base">CTA URL <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input id="email-cta-url" aria-invalid={!!(touched.cta_url && errors.cta_url)}
                className={`input-base ${touched.cta_url && errors.cta_url ? "border-error-300 focus:border-error-500" : ""}`}
                placeholder="https://..." value={form.cta_url}
                onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} onBlur={() => markTouched("cta_url")} />
              {touched.cta_url && errors.cta_url && <p className="text-xs text-error-600 mt-1">{errors.cta_url}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={send} disabled={sending}
              className="inline-flex items-center gap-2 h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors disabled:opacity-50">
              <Send className="icon-xs" /> {sending ? "Sending…" : "Send to All Users"}
            </button>
            <button onClick={sendTest} disabled={testSending}
              className="inline-flex items-center gap-2 h-9 px-4 bg-white hover:bg-neutral-50 border border-neutral-200 text-sm font-medium text-neutral-600 rounded-lg shadow-xs transition-colors disabled:opacity-50">
              {testSending ? "Sending…" : "Send Test to Me"}
            </button>
            <p className="text-xs text-neutral-400 ml-auto">Only users who opted in will receive this.</p>
          </div>
        </div>
      )}
    </div>
  );
}
