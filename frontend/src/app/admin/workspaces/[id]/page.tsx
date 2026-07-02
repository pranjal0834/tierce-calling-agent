"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ToggleLeft, ToggleRight, Plus, Minus, Users, Phone, Bot, Building2, ChevronDown, ChevronUp } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, adminPost, adminPut, WsDetail, PageHeading, LoadingBlock, Pill, CardLabel, fmt } from "@/components/admin/ui";

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<WsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjMinutes, setAdjMinutes] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setDetail(await adminGet(`/workspaces/${id}`)); }
    catch { toast.error("Failed to load workspace"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  async function adjustCredits(sign: 1 | -1) {
    const mins = parseFloat(adjMinutes);
    if (!mins || isNaN(mins)) { toast.error("Enter valid minutes"); return; }
    setAdjusting(true);
    try {
      const res = await adminPost(`/workspaces/${id}/credits`, { minutes: sign * mins, reason: adjReason });
      toast.success(`Balance updated: ${res.new_balance.toFixed(1)} min`);
      setAdjMinutes(""); setAdjReason("");
      setDetail(prev => prev ? { ...prev, credits_balance: res.new_balance } : prev);
    } catch { toast.error("Failed to adjust credits"); }
    finally { setAdjusting(false); }
  }

  async function toggleStatus() {
    if (!detail) return;
    setToggling(true);
    try {
      await adminPut(`/workspaces/${id}/status`, { is_active: !detail.is_active });
      toast.success(`Workspace ${detail.is_active ? "disabled" : "enabled"}`);
      setDetail(prev => prev ? { ...prev, is_active: !prev.is_active } : prev);
    } catch { toast.error("Failed to update status"); }
    finally { setToggling(false); }
  }

  if (loading) return <LoadingBlock />;
  if (!detail) return <p className="text-sm text-neutral-400 text-center py-10">Workspace not found.</p>;

  return (
    <>
      <PageHeading
        title={detail.name}
        subtitle={`${detail.plan} plan · ${detail.is_active ? "Active" : "Disabled"} · Created ${fmt(detail.created_at)}`}
        action={
          <div className="flex gap-2">
            <Link href="/admin/workspaces" className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={toggleStatus} disabled={toggling}
          className={`inline-flex items-center gap-2 px-3 h-9 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
            detail.is_active ? "text-error-600 border-error-200 hover:bg-error-50" : "text-success-600 border-success-200 hover:bg-success-50"
          }`}
        >
          {detail.is_active ? <ToggleRight className="icon-sm" /> : <ToggleLeft className="icon-sm" />}
          {detail.is_active ? "Disable workspace" : "Enable workspace"}
        </button>
      </div>

      {/* Adjust Credits */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <CardLabel>Adjust Credits</CardLabel>
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
            <Minus className="icon-sm" /> Deduct
          </button>
        </div>
        <p className="text-xs text-neutral-500">Current balance: <span className="text-neutral-900 font-medium">{detail.credits_balance.toFixed(1)} min</span></p>
      </div>

      {/* Detail grids */}
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
                  <span className={`font-medium ${t.minutes >= 0 ? "text-success-600" : "text-error-500"}`}>{t.minutes >= 0 ? "+" : ""}{t.minutes.toFixed(1)}m</span>
                </div>
              </div>
            ))}
            {detail.transactions.length === 0 && <p className="text-neutral-400 text-xs">No transactions</p>}
          </div>
        </div>
      </div>
    </>
  );
}
