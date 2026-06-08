"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck, Users, Phone, Bot, TrendingUp, RefreshCw,
  ToggleLeft, ToggleRight, Plus, Minus, ChevronDown, ChevronUp,
  Building2, Activity, DollarSign, Zap, Megaphone, Send, Trash2,
  AlertTriangle, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

// ── API helpers ───────────────────────────────────────────────────────────────

const adminGet  = (path: string) => api.get(`/api/admin${path}`).then(r => r.data);
const adminPost = (path: string, body: unknown) => api.post(`/api/admin${path}`, body).then(r => r.data);
const adminPut  = (path: string, body: unknown) => api.put(`/api/admin${path}`, body).then(r => r.data);

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  total_workspaces: number; total_users: number; total_calls: number;
  total_agents: number; total_revenue_usd: number;
  calls_last_24h: number; new_workspaces_7d: number;
}
interface WsRow {
  id: string; name: string; plan: string; is_active: boolean;
  credits_balance: number; member_count: number; call_count: number;
  agent_count: number; total_purchased_minutes: number; created_at: string;
}
interface WsDetail {
  id: string; name: string; plan: string; is_active: boolean;
  credits_balance: number; created_at: string;
  members: { id: string; email: string; role: string; is_active: boolean }[];
  agents: { id: string; name: string; pipeline_mode: string; is_active: boolean }[];
  recent_calls: { id: string; phone_number: string; status: string; duration_seconds?: number; created_at: string }[];
  transactions: { id: string; type: string; minutes: number; balance_after: number; description: string; amount_paid?: number; currency?: string; created_at: string }[];
}
interface UserRow {
  id: string; email: string; role: string; is_active: boolean;
  workspace_id: string; workspace_name: string; created_at: string;
}
interface CallRow {
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
interface CostData {
  range_days: number;
  usd_to_inr: number;
  total_calls: number; total_minutes: number;
  total_cost_usd: number; realtime_cost_usd: number; auxiliary_cost_usd: number;
  avg_cost_per_call_usd: number; avg_cost_per_min_usd: number;
  revenue_usd: number; gross_margin_usd: number;
  auxiliary_components: { name: string; usd: number; calls: number }[];
  top_workspaces: { workspace: string; cost_usd: number; calls: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function KPI({ label, value, icon: Icon, sub, color }: { label: string; value: string | number; icon: React.ElementType; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-neutral-500">{label}</span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-[22px] font-semibold text-neutral-900 tracking-tight">{value}</div>
      {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── Workspace row with expandable detail ──────────────────────────────────────

function WorkspaceRow({ ws, onRefresh }: { ws: WsRow; onRefresh: () => void }) {
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
      const res = await adminPost(`/workspaces/${ws.id}/credits`, {
        minutes: sign * mins,
        reason: adjReason,
      });
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
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      {/* Row header */}
      <div
        className="flex items-center gap-4 px-5 py-4 bg-white cursor-pointer hover:bg-neutral-50 transition-colors border-b border-neutral-200"
        onClick={expand}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ws.is_active ? "bg-green-400" : "bg-neutral-600"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 truncate">{ws.name}</p>
          <p className="text-xs text-neutral-500">{fmt(ws.created_at)}</p>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-xs text-neutral-500">
          <span title="Members"><Users className="w-3 h-3 inline mr-1" />{ws.member_count}</span>
          <span title="Agents"><Bot className="w-3 h-3 inline mr-1" />{ws.agent_count}</span>
          <span title="Calls"><Phone className="w-3 h-3 inline mr-1" />{ws.call_count}</span>
          <span title="Balance" className={ws.credits_balance <= 0 ? "text-red-400" : "text-green-400"}> {ws.credits_balance.toFixed(1)} min</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${ws.is_active ? "text-green-400 bg-green-100 border-green-200" : "text-neutral-500 bg-neutral-100 border-neutral-200"}`}>{ws.is_active ? "Active" : "Disabled"}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-neutral-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-neutral-500 flex-shrink-0" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-neutral-200 bg-neutral-50 p-5 space-y-5">
          {loadingDetail ? (
            <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 text-neutral-600 animate-spin" /></div>
          ) : detail ? (
            <>
              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={toggleStatus}
                  disabled={toggling}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${ws.is_active ? "text-red-400 border-red-500/30 hover:bg-red-100" : "text-green-400 border-green-500/30 hover:bg-green-100"} disabled:opacity-50`}
                >
                  {ws.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {ws.is_active ? "Disable workspace" : "Enable workspace"}
                </button>
              </div>

              {/* Credit adjustment */}
              <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Adjust Credits</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Minutes"
                    value={adjMinutes}
                    onChange={e => setAdjMinutes(e.target.value)}
                    className="w-28 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={adjReason}
                    onChange={e => setAdjReason(e.target.value)}
                    className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm focus:outline-none focus:border-brand-500"
                  />
                  <button onClick={() => adjustCredits(1)} disabled={adjusting}
                    className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg border border-green-600 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                  <button onClick={() => adjustCredits(-1)} disabled={adjusting}
                    className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg border border-red-600 disabled:opacity-50"
                  >
                    <Minus className="w-3.5 h-3.5" /> Deduct
                  </button>
                </div>
                <p className="text-xs text-neutral-600">Current balance: <span className="text-neutral-900">{detail.credits_balance.toFixed(1)} min</span></p>
              </div>

              {/* Members, Agents, Calls, Transactions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Members */}
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Members ({detail.members.length})</p>
                  <div className="space-y-2">
                    {detail.members.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700 truncate">{m.email}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${m.role === "owner" ? "text-yellow-600 bg-yellow-100" : "text-blue-600 bg-blue-100"}`}>{m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agents */}
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Agents ({detail.agents.length})</p>
                  <div className="space-y-2">
                    {detail.agents.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700 truncate">{a.name}</span>
                        <span className="text-neutral-500">{a.pipeline_mode}</span>
                      </div>
                    ))}
                    {detail.agents.length === 0 && <p className="text-neutral-600 text-xs">No agents</p>}
                  </div>
                </div>

                {/* Recent calls */}
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Recent Calls</p>
                  <div className="space-y-2">
                    {detail.recent_calls.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700">{c.phone_number}</span>
                        <div className="flex items-center gap-2">
                          {c.duration_seconds && <span className="text-neutral-500">{c.duration_seconds}s</span>}
                          <span className={`px-1.5 py-0.5 rounded ${c.status === "completed" ? "text-green-600 bg-green-100" : "text-neutral-600 bg-neutral-100"}`}>{c.status}</span>
                        </div>
                      </div>
                    ))}
                    {detail.recent_calls.length === 0 && <p className="text-neutral-600 text-xs">No calls yet</p>}
                  </div>
                </div>

                {/* Transactions */}
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Billing Transactions</p>
                  <div className="space-y-2">
                    {detail.transactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-700 truncate max-w-[160px]">{t.description || t.type}</span>
                        <div className="flex items-center gap-2">
                          {t.amount_paid && <span className="text-neutral-500">{t.currency === "INR" ? "₹" : "$"}{t.amount_paid}</span>}
                          <span className={t.minutes >= 0 ? "text-green-600" : "text-red-600"}> {t.minutes >= 0 ? "+" : ""}{t.minutes.toFixed(1)}m</span>
                        </div>
                      </div>
                    ))}
                    {detail.transactions.length === 0 && <p className="text-neutral-600 text-xs">No transactions</p>}
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

// ── Admin call row with expandable cost breakdown ─────────────────────────────

function CostLine({ label, v, bold, accent, sub }: { label: string; v?: number | null; bold?: boolean; accent?: boolean; sub?: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className={bold ? "text-neutral-700 font-medium" : "text-neutral-500"}>
        {label}{sub && <span className="text-neutral-400 ml-1">{sub}</span>}
      </span>
      <span className={accent ? "text-yellow-600 font-semibold" : bold ? "text-neutral-900 font-medium" : "text-neutral-600"}>
        {v != null ? `$${Number(v).toFixed(4)}` : "—"}
      </span>
    </div>
  );
}

function AdminCallRow({ c }: { c: CallRow }) {
  const [open, setOpen] = useState(false);
  const cb = c.cost_breakdown;
  const hasCost = c.cost_usd != null && c.cost_usd > 0;
  const auxEntries = cb?.auxiliary ? Object.entries(cb.auxiliary) : [];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-3">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "in_progress" ? "bg-green-400 animate-pulse" : c.status === "completed" ? "bg-neutral-500" : "bg-yellow-400"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-900">{c.phone_number}</p>
          <p className="text-xs text-neutral-500">{c.workspace_name} · {c.pipeline_mode}</p>
        </div>
        <span className="text-xs text-neutral-400 hidden sm:inline">{c.direction}</span>
        {c.duration_seconds ? <span className="text-xs text-neutral-500">{c.duration_seconds}s</span> : null}
        {hasCost
          ? <span className="text-xs font-medium text-yellow-600 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">${c.cost_usd!.toFixed(4)}</span>
          : <span className="text-xs text-neutral-300">—</span>}
        <span className={`text-xs px-2 py-0.5 rounded-full border ${c.status === "completed" ? "text-green-600 border-green-500/20 bg-green-100" : "text-neutral-600 border-neutral-200 bg-neutral-100"}`}>{c.status}</span>
        <span className="text-xs text-neutral-600 hidden md:inline">{fmt(c.created_at)}</span>
        <button
          onClick={() => setOpen(o => !o)}
          disabled={!hasCost}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-default flex-shrink-0"
          title={hasCost ? "Cost breakdown" : "No cost recorded"}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {open && hasCost && cb && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Realtime audio</p>
            <CostLine label="Audio in" v={cb.audio_in_usd} />
            <CostLine label="Audio out" v={cb.audio_out_usd} />
            <CostLine label="Text in" v={cb.text_in_usd} />
            <CostLine label="Text out" v={cb.text_out_usd} />
            <CostLine label="Transcription (Whisper)" v={cb.transcription_usd} />
            <CostLine label="Realtime subtotal" v={cb.realtime_usd} bold />
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Auxiliary models</p>
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

function DeleteConfirmModal({ email, onConfirm, onCancel, loading }: {
  email: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-modal w-full max-w-sm animate-scale-in">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="w-10 h-10 bg-red-50 border border-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          <h2 className="text-[15px] font-semibold text-neutral-900 mb-1.5">Delete account</h2>
          <p className="text-sm text-neutral-500 mb-1">
            You are about to permanently delete:
          </p>
          <p className="text-sm font-semibold text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-4 font-mono break-all">
            {email}
          </p>
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-red-700 leading-relaxed">
              If this is the only member of their workspace, <span className="font-semibold">the entire workspace — including all agents, calls, and data — will also be permanently deleted.</span> This action cannot be undone.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 h-10 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300 text-sm font-medium text-neutral-600 rounded-xl transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 className="w-3.5 h-3.5" /> Delete Account</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Announcement panel ────────────────────────────────────────────────────────

function AnnouncementPanel() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    subject: "", headline: "", body: "",
    cta_label: "", cta_url: "",
  });
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const send = async () => {
    if (!form.subject || !form.headline || !form.body) {
      toast.error("Subject, headline, and body are required");
      return;
    }
    setSending(true);
    try {
      const res = await api.post<{ sent: number; message: string }>("/api/notifications/announce", form);
      toast.success(res.data.message);
      setForm({ subject: "", headline: "", body: "", cta_label: "", cta_url: "" });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to send announcement");
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    setTestSending(true);
    try {
      const res = await api.post<{ message: string }>("/api/notifications/test");
      toast.success(res.data.message);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "SMTP not configured — check SMTP_* env vars");
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
      >
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
          <div className="grid grid-cols-2 gap-4">
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
            <textarea
              className="input-base min-h-[100px] resize-none"
              placeholder="Describe what's new, what changed, or any important update…"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-base">CTA Button Label <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input className="input-base" placeholder="Try it now" value={form.cta_label} onChange={e => setForm(f => ({ ...f, cta_label: e.target.value }))} />
            </div>
            <div>
              <label className="label-base">CTA URL <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input className="input-base" placeholder="https://..." value={form.cta_url} onChange={e => setForm(f => ({ ...f, cta_url: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={send}
              disabled={sending}
              className="inline-flex items-center gap-2 h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? "Sending…" : "Send to All Users"}
            </button>
            <button
              onClick={sendTest}
              disabled={testSending}
              className="inline-flex items-center gap-2 h-9 px-4 bg-white hover:bg-neutral-50 border border-neutral-200 text-sm font-medium text-neutral-600 rounded-lg shadow-xs transition-colors disabled:opacity-50"
            >
              {testSending ? "Sending…" : "Send Test to Me"}
            </button>
            <p className="text-xs text-neutral-400 ml-auto">Only users who opted in will receive this.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workspaces, setWorkspaces] = useState<WsRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [costDays, setCostDays] = useState(30);
  const [costLoading, setCostLoading] = useState(false);
  const [tab, setTab] = useState<"workspaces" | "users" | "calls" | "costs">("workspaces");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, ws] = await Promise.all([
        adminGet("/stats"),
        adminGet("/workspaces"),
      ]);
      setStats(s);
      setWorkspaces(ws);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) setForbidden(true);
      else toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/users/${deleteTarget.id}`);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.email}`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  const loadCosts = useCallback(async (days: number) => {
    setCostLoading(true);
    try { setCosts(await adminGet(`/costs?days=${days}`)); }
    catch { toast.error("Failed to load cost analytics"); }
    finally { setCostLoading(false); }
  }, []);

  async function loadTab(t: typeof tab) {
    setTab(t);
    try {
      if (t === "users" && users.length === 0) setUsers(await adminGet("/users"));
      if (t === "calls" && calls.length === 0) setCalls(await adminGet("/calls"));
      if (t === "costs" && !costs) loadCosts(costDays);
    } catch { toast.error("Failed to load data"); }
  }


  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-neutral-50">
      <RefreshCw className="w-6 h-6 text-neutral-400 animate-spin" />
    </div>
  );

  if (forbidden) return (
    <div className="flex flex-col items-center justify-center h-screen bg-neutral-50 gap-4">
      <ShieldCheck className="w-12 h-12 text-red-400" />
      <p className="text-neutral-900 text-lg font-semibold">Super admin access required</p>
      <p className="text-neutral-600 text-sm">Your account is not in the ADMIN_EMAILS list.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Top bar */}
      <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-neutral-900">Vaaniq</span>
          <span className="text-neutral-600 mx-1">·</span>
          <div className="flex items-center gap-1.5 text-sm text-brand-400">
            <ShieldCheck className="w-4 h-4" /> Super Admin
          </div>
        </div>
        <a href="/" className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors">← Back to app</a>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            <KPI label="Workspaces"    value={stats.total_workspaces}   icon={Building2}   color="text-brand-400" sub={`+${stats.new_workspaces_7d} this week`} />
            <KPI label="Users"         value={stats.total_users}        icon={Users}       color="text-blue-400"   />
            <KPI label="Total Calls"   value={stats.total_calls}        icon={Phone}       color="text-green-400"  sub={`${stats.calls_last_24h} last 24h`} />
            <KPI label="Agents"        value={stats.total_agents}       icon={Bot}         color="text-purple-400" />
            <KPI label="Revenue (USD)" value={`$${stats.total_revenue_usd.toFixed(2)}`} icon={DollarSign} color="text-yellow-400" />
            <KPI label="Calls (24h)"   value={stats.calls_last_24h}     icon={Activity}    color="text-cyan-400"   />
            <KPI label="New (7d)"      value={stats.new_workspaces_7d}  icon={TrendingUp}  color="text-pink-400"   />
          </div>
        )}

        {/* Announcement panel */}
        <AnnouncementPanel />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-neutral-200 pb-4">
          {(["workspaces", "users", "calls", "costs"] as const).map(t => (
            <button key={t} onClick={() => loadTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? "bg-brand-100 text-brand-600 border border-brand-200" : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"}`}
            >
              {t}
            </button>
          ))}
          <button onClick={load} className="ml-auto text-neutral-500 hover:text-neutral-900 p-2 rounded-lg hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Workspaces tab */}
        {tab === "workspaces" && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">{workspaces.length} workspaces</p>
            {workspaces.map(ws => (
              <WorkspaceRow key={ws.id} ws={ws} onRefresh={load} />
            ))}
          </div>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="space-y-2">
            <p className="text-sm text-neutral-500 mb-3">{users.length} users</p>
            {users.map(u => (
              <div key={u.id} className="group flex items-center gap-4 bg-white border border-neutral-200 rounded-xl px-5 py-3 hover:border-neutral-300 transition-colors">
                <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xs font-medium text-brand-400 flex-shrink-0">
                  {u.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 truncate">{u.email}</p>
                  <p className="text-xs text-neutral-500">{u.workspace_name}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${u.role === "owner" ? "text-yellow-600 border-yellow-500/30 bg-yellow-100" : "text-blue-600 border-blue-500/30 bg-blue-100"}`}>{u.role}</span>
                <span className="text-xs text-neutral-500 hidden md:inline">{fmt(u.created_at)}</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${u.is_active ? "bg-green-400" : "bg-neutral-400"}`} />
                <button
                  onClick={() => setDeleteTarget(u)}
                  className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 flex-shrink-0"
                  title="Delete account"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Calls tab */}
        {tab === "calls" && (
          <div className="space-y-2">
            <p className="text-sm text-neutral-500 mb-3">Last {calls.length} calls across all workspaces · tap a row to see its cost breakdown</p>
            {calls.map(c => (
              <AdminCallRow key={c.id} c={c} />
            ))}
          </div>
        )}

        {/* Costs tab — owner only (COGS) */}
        {tab === "costs" && (
          <div className="space-y-5">
            {/* Range selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">Period:</span>
              {[7, 30, 90].map(d => (
                <button key={d}
                  onClick={() => { setCostDays(d); loadCosts(d); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${costDays === d ? "bg-brand-100 text-brand-600 border-brand-200" : "text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}
                >
                  Last {d} days
                </button>
              ))}
              {costs && (
                <span className="ml-auto text-xs text-neutral-500 bg-neutral-100 border border-neutral-200 rounded-lg px-2.5 py-1">
                  Rate: <span className="font-medium text-neutral-700">$1 = ₹{costs.usd_to_inr.toFixed(2)}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">AI cost of goods sold — not shown to tenants</p>

            {costLoading || !costs ? (
              <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 text-neutral-400 animate-spin" /></div>
            ) : (
              <>
                {/* Headline KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  <KPI label="Total AI Cost" value={`$${costs.total_cost_usd.toFixed(2)}`} icon={DollarSign} color="text-yellow-500" sub={`${costs.total_calls} calls · ${costs.total_minutes} min`} />
                  <KPI label="Realtime Audio" value={`$${costs.realtime_cost_usd.toFixed(2)}`} icon={Phone} color="text-brand-500" sub={costs.total_cost_usd > 0 ? `${Math.round(costs.realtime_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—"} />
                  <KPI label="Auxiliary AI" value={`$${costs.auxiliary_cost_usd.toFixed(2)}`} icon={Zap} color="text-purple-500" sub={costs.total_cost_usd > 0 ? `${Math.round(costs.auxiliary_cost_usd / costs.total_cost_usd * 100)}% of cost` : "—"} />
                  <KPI label="Cost / Min" value={`$${costs.avg_cost_per_min_usd.toFixed(4)}`} icon={Activity} color="text-cyan-500" />
                  <KPI label="Cost / Call" value={`$${costs.avg_cost_per_call_usd.toFixed(4)}`} icon={TrendingUp} color="text-pink-500" />
                  <KPI label="Gross Margin" value={`$${costs.gross_margin_usd.toFixed(2)}`} icon={DollarSign} color={costs.gross_margin_usd >= 0 ? "text-green-500" : "text-red-500"} sub={`rev ≈ $${costs.revenue_usd.toFixed(2)}`} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Auxiliary breakdown */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-5">
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-4">Auxiliary cost by component</p>
                    {costs.auxiliary_components.length === 0 ? (
                      <p className="text-sm text-neutral-500">No auxiliary costs recorded in this period.</p>
                    ) : (
                      <div className="space-y-3">
                        {costs.auxiliary_components.map(c => {
                          const pct = costs.auxiliary_cost_usd > 0 ? (c.usd / costs.auxiliary_cost_usd * 100) : 0;
                          return (
                            <div key={c.name}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-neutral-700">{c.name.replace(/_/g, " ")}</span>
                                <span className="text-neutral-500">${c.usd.toFixed(4)} <span className="text-neutral-400">({c.calls} calls)</span></span>
                              </div>
                              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-400 rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Top workspaces by cost */}
                  <div className="bg-white border border-neutral-200 rounded-xl p-5">
                    <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-4">Top workspaces by AI cost</p>
                    {costs.top_workspaces.length === 0 ? (
                      <p className="text-sm text-neutral-500">No costed calls in this period.</p>
                    ) : (
                      <div className="space-y-2">
                        {costs.top_workspaces.map((w, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-neutral-700 truncate flex-1">{w.workspace}</span>
                            <span className="text-neutral-400 mx-3">{w.calls} calls</span>
                            <span className="text-neutral-900 font-medium">${w.cost_usd.toFixed(4)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteConfirmModal
          email={deleteTarget.email}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}

