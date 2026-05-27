"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck, Users, Phone, Bot, TrendingUp, RefreshCw,
  ToggleLeft, ToggleRight, Plus, Minus, ChevronDown, ChevronUp,
  Building2, Activity, DollarSign, Zap,
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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
      setDetail(null); // force re-fetch
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
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      {/* Row header */}
      <div
        className="flex items-center gap-4 px-5 py-4 bg-gray-900 cursor-pointer hover:bg-gray-800/60 transition-colors"
        onClick={expand}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ws.is_active ? "bg-green-400" : "bg-gray-600"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{ws.name}</p>
          <p className="text-xs text-gray-500">{fmt(ws.created_at)}</p>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-xs text-gray-400">
          <span title="Members"><Users className="w-3 h-3 inline mr-1" />{ws.member_count}</span>
          <span title="Agents"><Bot className="w-3 h-3 inline mr-1" />{ws.agent_count}</span>
          <span title="Calls"><Phone className="w-3 h-3 inline mr-1" />{ws.call_count}</span>
          <span title="Balance" className={ws.credits_balance <= 0 ? "text-red-400" : "text-green-400"}>
            {ws.credits_balance.toFixed(1)} min
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border hidden sm:inline ${
          ws.is_active ? "text-green-400 bg-green-400/10 border-green-400/20" : "text-gray-500 bg-gray-800 border-gray-700"
        }`}>{ws.is_active ? "Active" : "Disabled"}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 bg-gray-950 p-5 space-y-5">
          {loadingDetail ? (
            <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 text-gray-600 animate-spin" /></div>
          ) : detail ? (
            <>
              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={toggleStatus}
                  disabled={toggling}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    ws.is_active
                      ? "text-red-400 border-red-500/30 hover:bg-red-500/10"
                      : "text-green-400 border-green-500/30 hover:bg-green-500/10"
                  } disabled:opacity-50`}
                >
                  {ws.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {ws.is_active ? "Disable workspace" : "Enable workspace"}
                </button>
              </div>

              {/* Credit adjustment */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Adjust Credits</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Minutes"
                    value={adjMinutes}
                    onChange={e => setAdjMinutes(e.target.value)}
                    className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Reason (optional)"
                    value={adjReason}
                    onChange={e => setAdjReason(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <button onClick={() => adjustCredits(1)} disabled={adjusting}
                    className="flex items-center gap-1 px-3 py-2 bg-green-700/40 hover:bg-green-700/60 text-green-300 text-xs rounded-lg border border-green-700/40 disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                  <button onClick={() => adjustCredits(-1)} disabled={adjusting}
                    className="flex items-center gap-1 px-3 py-2 bg-red-700/30 hover:bg-red-700/50 text-red-300 text-xs rounded-lg border border-red-700/30 disabled:opacity-50">
                    <Minus className="w-3.5 h-3.5" /> Deduct
                  </button>
                </div>
                <p className="text-xs text-gray-600">Current balance: <span className="text-white">{detail.credits_balance.toFixed(1)} min</span></p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Members */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Members ({detail.members.length})</p>
                  <div className="space-y-2">
                    {detail.members.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 truncate">{m.email}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${m.role === "owner" ? "text-yellow-400 bg-yellow-400/10" : "text-blue-400 bg-blue-400/10"}`}>{m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Agents */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Agents ({detail.agents.length})</p>
                  <div className="space-y-2">
                    {detail.agents.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 truncate">{a.name}</span>
                        <span className="text-gray-500">{a.pipeline_mode}</span>
                      </div>
                    ))}
                    {detail.agents.length === 0 && <p className="text-gray-600 text-xs">No agents</p>}
                  </div>
                </div>

                {/* Recent calls */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Recent Calls</p>
                  <div className="space-y-2">
                    {detail.recent_calls.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300">{c.phone_number}</span>
                        <div className="flex items-center gap-2">
                          {c.duration_seconds && <span className="text-gray-500">{c.duration_seconds}s</span>}
                          <span className={`px-1.5 py-0.5 rounded ${c.status === "completed" ? "text-green-400 bg-green-400/10" : "text-gray-400 bg-gray-800"}`}>{c.status}</span>
                        </div>
                      </div>
                    ))}
                    {detail.recent_calls.length === 0 && <p className="text-gray-600 text-xs">No calls yet</p>}
                  </div>
                </div>

                {/* Transactions */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Billing Transactions</p>
                  <div className="space-y-2">
                    {detail.transactions.map(t => (
                      <div key={t.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-300 truncate max-w-[160px]">{t.description || t.type}</span>
                        <div className="flex items-center gap-2">
                          {t.amount_paid && <span className="text-gray-500">{t.currency === "INR" ? "₹" : "$"}{t.amount_paid}</span>}
                          <span className={t.minutes >= 0 ? "text-green-400" : "text-red-400"}>
                            {t.minutes >= 0 ? "+" : ""}{t.minutes.toFixed(1)}m
                          </span>
                        </div>
                      </div>
                    ))}
                    {detail.transactions.length === 0 && <p className="text-gray-600 text-xs">No transactions</p>}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workspaces, setWorkspaces] = useState<WsRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [tab, setTab] = useState<"workspaces" | "users" | "calls">("workspaces");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

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

  async function loadTab(t: typeof tab) {
    setTab(t);
    try {
      if (t === "users" && users.length === 0)   setUsers(await adminGet("/users"));
      if (t === "calls" && calls.length === 0)   setCalls(await adminGet("/calls"));
    } catch { toast.error("Failed to load data"); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
    </div>
  );

  if (forbidden) return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 gap-4">
      <ShieldCheck className="w-12 h-12 text-red-400" />
      <p className="text-white text-lg font-semibold">Super admin access required</p>
      <p className="text-gray-400 text-sm">Your account is not in the ADMIN_EMAILS list.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Tierce</span>
          <span className="text-gray-600 mx-1">·</span>
          <div className="flex items-center gap-1.5 text-sm text-indigo-400">
            <ShieldCheck className="w-4 h-4" /> Super Admin
          </div>
        </div>
        <a href="/" className="text-xs text-gray-500 hover:text-white transition-colors">← Back to app</a>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* KPI cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            <KPI label="Workspaces"    value={stats.total_workspaces}   icon={Building2}   color="text-indigo-400" sub={`+${stats.new_workspaces_7d} this week`} />
            <KPI label="Users"         value={stats.total_users}        icon={Users}       color="text-blue-400"   />
            <KPI label="Total Calls"   value={stats.total_calls}        icon={Phone}       color="text-green-400"  sub={`${stats.calls_last_24h} last 24h`} />
            <KPI label="Agents"        value={stats.total_agents}       icon={Bot}         color="text-purple-400" />
            <KPI label="Revenue (USD)" value={`$${stats.total_revenue_usd.toFixed(2)}`} icon={DollarSign} color="text-yellow-400" />
            <KPI label="Calls (24h)"   value={stats.calls_last_24h}     icon={Activity}    color="text-cyan-400"   />
            <KPI label="New (7d)"      value={stats.new_workspaces_7d}  icon={TrendingUp}  color="text-pink-400"   />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800 pb-4">
          {(["workspaces", "users", "calls"] as const).map(t => (
            <button key={t} onClick={() => loadTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}>
              {t}
            </button>
          ))}
          <button onClick={load} className="ml-auto text-gray-500 hover:text-white p-2 rounded-lg hover:bg-gray-800 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Workspaces tab */}
        {tab === "workspaces" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{workspaces.length} workspaces</p>
            {workspaces.map(ws => (
              <WorkspaceRow key={ws.id} ws={ws} onRefresh={load} />
            ))}
          </div>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 mb-3">{users.length} users</p>
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-medium text-indigo-400 flex-shrink-0">
                  {u.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{u.email}</p>
                  <p className="text-xs text-gray-500">{u.workspace_name}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border hidden sm:inline ${
                  u.role === "owner" ? "text-yellow-400 border-yellow-500/30 bg-yellow-400/10" : "text-blue-400 border-blue-500/30 bg-blue-400/10"
                }`}>{u.role}</span>
                <span className="text-xs text-gray-500 hidden md:inline">{fmt(u.created_at)}</span>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${u.is_active ? "bg-green-400" : "bg-gray-600"}`} />
              </div>
            ))}
          </div>
        )}

        {/* Calls tab */}
        {tab === "calls" && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500 mb-3">Last {calls.length} calls across all workspaces</p>
            {calls.map(c => (
              <div key={c.id} className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  c.status === "in_progress" ? "bg-green-400 animate-pulse" :
                  c.status === "completed" ? "bg-gray-500" : "bg-yellow-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">{c.phone_number}</p>
                  <p className="text-xs text-gray-500">{c.workspace_name} · {c.pipeline_mode}</p>
                </div>
                <span className="text-xs text-gray-400 hidden sm:inline">{c.direction}</span>
                {c.duration_seconds && <span className="text-xs text-gray-500">{c.duration_seconds}s</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  c.status === "completed" ? "text-green-400 border-green-500/20 bg-green-400/10" : "text-gray-400 border-gray-700 bg-gray-800"
                }`}>{c.status}</span>
                <span className="text-xs text-gray-600 hidden md:inline">{fmt(c.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
