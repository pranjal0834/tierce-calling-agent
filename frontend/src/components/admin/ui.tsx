"use client";
import { useState } from "react";
import {
  Users, Phone, Bot, RefreshCw,
  ToggleLeft, ToggleRight, Plus, Minus, ChevronDown, ChevronUp,
  Megaphone, Send, Trash2, AlertTriangle, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

// ── Shared API helpers ────────────────────────────────────────────────────────

export const adminGet  = (path: string) => api.get(`/api/admin${path}`).then(r => r.data);
export const adminPost = (path: string, body: unknown) => api.post(`/api/admin${path}`, body).then(r => r.data);
export const adminPut  = (path: string, body: unknown) => api.put(`/api/admin${path}`, body).then(r => r.data);

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
}
export interface CallRow {
  id: string; workspace_name: string; phone_number: string;
  direction: string; status: string; duration_seconds?: number;
  pipeline_mode: string; created_at: string;
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
  top_workspaces: { workspace: string; cost_usd: number; calls: number }[];
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

// KPI card — tinted icon chip, light palette
export function KpiStat({ label, value, icon: Icon, sub, tint }: {
  label: string; value: string | number; icon: React.ElementType; sub?: string; tint: string;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs px-4 py-3.5 min-w-0">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 truncate">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${tint}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-[22px] font-semibold text-neutral-900 tracking-tight leading-none">{value}</div>
      {sub && <p className="text-[11px] text-neutral-400 mt-1.5 truncate">{sub}</p>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "emerald" | "amber" | "blue" | "red" }) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
    blue:    "bg-blue-50 text-blue-700",
    red:     "bg-red-50 text-red-700",
  };
  return <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${tones[tone]}`}>{children}</span>;
}

export function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-3">{children}</p>;
}

export function LoadingBlock() {
  return <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 text-neutral-400 animate-spin" /></div>;
}

// ── Workspace row with expandable detail ──────────────────────────────────────

export function WorkspaceRow({ ws, onRefresh }: { ws: WsRow; onRefresh: () => void }) {
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
      <div className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-neutral-50 transition-colors" onClick={expand}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ws.is_active ? "bg-emerald-400" : "bg-neutral-300"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900 truncate">{ws.name}</p>
          <p className="text-xs text-neutral-400">{fmt(ws.created_at)}</p>
        </div>
        <div className="hidden sm:flex items-center gap-5 text-xs text-neutral-500">
          <span title="Members"><Users className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />{ws.member_count}</span>
          <span title="Agents"><Bot className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />{ws.agent_count}</span>
          <span title="Calls"><Phone className="w-3.5 h-3.5 inline mr-1 text-neutral-400" />{ws.call_count}</span>
          <span title="Balance" className={`font-medium ${ws.credits_balance <= 0 ? "text-red-500" : "text-emerald-600"}`}>{ws.credits_balance.toFixed(1)} min</span>
        </div>
        <Pill tone={ws.is_active ? "emerald" : "neutral"}>{ws.is_active ? "Active" : "Disabled"}</Pill>
        {expanded ? <ChevronUp className="w-4 h-4 text-neutral-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-neutral-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50 p-5 space-y-5">
          {loadingDetail ? (
            <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 text-neutral-400 animate-spin" /></div>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={toggleStatus} disabled={toggling}
                  className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                    ws.is_active ? "text-red-600 border-red-200 hover:bg-red-50" : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  {ws.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {ws.is_active ? "Disable workspace" : "Enable workspace"}
                </button>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
                <CardLabel>Adjust Credits</CardLabel>
                <div className="flex flex-wrap gap-2">
                  <input type="number" placeholder="Minutes" value={adjMinutes} onChange={e => setAdjMinutes(e.target.value)}
                    className="w-28 bg-white border border-neutral-200 rounded-lg px-3 h-9 text-neutral-900 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
                  <input type="text" placeholder="Reason (optional)" value={adjReason} onChange={e => setAdjReason(e.target.value)}
                    className="flex-1 min-w-[8rem] bg-white border border-neutral-200 rounded-lg px-3 h-9 text-neutral-900 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" />
                  <button onClick={() => adjustCredits(1)} disabled={adjusting}
                    className="inline-flex items-center gap-1 px-3 h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                  <button onClick={() => adjustCredits(-1)} disabled={adjusting}
                    className="inline-flex items-center gap-1 px-3 h-9 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium rounded-lg disabled:opacity-50">
                    <Minus className="w-3.5 h-3.5" /> Deduct
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
                  <CardLabel>Recent Calls</CardLabel>
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
                          <span className={`font-medium ${t.minutes >= 0 ? "text-emerald-600" : "text-red-500"}`}>{t.minutes >= 0 ? "+" : ""}{t.minutes.toFixed(1)}m</span>
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
      <span className={accent ? "text-amber-600 font-semibold" : bold ? "text-neutral-900 font-medium" : "text-neutral-600"}>
        {v != null ? `$${Number(v).toFixed(4)}` : "—"}
      </span>
    </div>
  );
}

export function AdminCallRow({ c }: { c: CallRow }) {
  const [open, setOpen] = useState(false);
  const cb = c.cost_breakdown;
  const hasCost = c.cost_usd != null && c.cost_usd > 0;
  const auxEntries = cb?.auxiliary ? Object.entries(cb.auxiliary) : [];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-3">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "in_progress" ? "bg-brand-400 animate-pulse" : c.status === "completed" ? "bg-emerald-400" : "bg-amber-400"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-900 truncate">{c.phone_number}</p>
          <p className="text-xs text-neutral-400 truncate">{c.workspace_name} · {c.pipeline_mode}</p>
        </div>
        <span className="text-xs text-neutral-400 hidden sm:inline capitalize">{c.direction}</span>
        {c.duration_seconds ? <span className="text-xs text-neutral-500">{c.duration_seconds}s</span> : null}
        {hasCost
          ? <span className="text-xs font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">${c.cost_usd!.toFixed(4)}</span>
          : <span className="text-xs text-neutral-300">—</span>}
        <Pill tone={c.status === "completed" ? "emerald" : "neutral"}>{c.status}</Pill>
        <span className="text-xs text-neutral-400 hidden md:inline">{fmt(c.created_at)}</span>
        <button onClick={() => setOpen(o => !o)} disabled={!hasCost}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-default flex-shrink-0"
          title={hasCost ? "Cost breakdown" : "No cost recorded"}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

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
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal w-full max-w-sm animate-scale-in">
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="w-10 h-10 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <button onClick={onCancel} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 pb-6">
          <h2 className="text-[15px] font-semibold text-neutral-900 mb-1.5">Delete account</h2>
          <p className="text-sm text-neutral-500 mb-1">You are about to permanently delete:</p>
          <p className="text-sm font-semibold text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-4 font-mono break-all">{email}</p>
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-red-700 leading-relaxed">
              If this is the only member of their workspace, <span className="font-semibold">the entire workspace — including all agents, calls, and data — will also be permanently deleted.</span> This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={loading}
              className="flex-1 h-10 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-sm font-medium text-neutral-600 rounded-xl transition-all disabled:opacity-50">
              Cancel
            </button>
            <button onClick={onConfirm} disabled={loading}
              className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
              {loading ? (<><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Deleting…</>) : (<><Trash2 className="w-3.5 h-3.5" /> Delete Account</>)}
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
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const send = async () => {
    if (!form.subject || !form.headline || !form.body) { toast.error("Subject, headline, and body are required"); return; }
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
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-50 border border-brand-200 rounded-lg flex items-center justify-center">
            <Megaphone className="w-4 h-4 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-neutral-900">Send Announcement</p>
            <p className="text-xs text-neutral-500">Broadcast a feature update or message to all opted-in users</p>
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-neutral-100 px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">Email Subject</label>
              <input className="input-base" placeholder="🚀 New features in Vaaniq" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <label className="label-base">Headline</label>
              <input className="input-base" placeholder="We just shipped something exciting" value={form.headline} onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label-base">Body</label>
            <textarea className="input-base min-h-[100px] resize-none" placeholder="Describe what's new, what changed, or any important update…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-base">CTA Button Label <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input className="input-base" placeholder="Try it now" value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))} />
            </div>
            <div>
              <label className="label-base">CTA URL <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input className="input-base" placeholder="https://..." value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={send} disabled={sending}
              className="inline-flex items-center gap-2 h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send to All Users"}
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
