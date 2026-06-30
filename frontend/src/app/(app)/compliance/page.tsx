"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Clock, PhoneOff, TrendingDown, Activity,
  Plus, Trash2, RefreshCw, AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getDnc, addDnc, removeDnc,
  getComplianceSettings, saveComplianceSettings, getComplianceStats,
} from "@/lib/api";

interface DncRow { id: string; phone_number: string; reason: string | null; source: string; created_at: string | null; }

const SOURCE_LABEL: Record<string, string> = { manual: "Added manually", opt_out: "Caller opted out", import: "Imported" };

export default function CompliancePage() {
  const [stats, setStats] = useState<any>(null);
  const [dnc, setDnc] = useState<DncRow[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [numbersText, setNumbersText] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);

  const reload = async () => {
    const [s, d, cfg] = await Promise.all([
      getComplianceStats(30).catch(() => null),
      getDnc().catch(() => []),
      getComplianceSettings().catch(() => null),
    ]);
    setStats(s); setDnc(d || []); setSettings(cfg);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const handleAddDnc = async () => {
    const nums = numbersText.split(/[\n,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (nums.length === 0) { toast.error("Enter one or more phone numbers"); return; }
    setAdding(true);
    try {
      const res = await addDnc(nums);
      toast.success(`Added ${res.added} number${res.added === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} skipped` : ""}`);
      setNumbersText("");
      const [d, s] = await Promise.all([getDnc(), getComplianceStats(30)]);
      setDnc(d || []); setStats(s);
    } catch {
      toast.error("Failed to add numbers");
    }
    setAdding(false);
  };

  const handleRemoveDnc = async (id: string) => {
    setDnc(prev => prev.filter(x => x.id !== id));
    try { await removeDnc(id); } catch { toast.error("Failed to remove"); reload(); }
  };

  const handleSaveWindow = async () => {
    setSavingWindow(true);
    try {
      await saveComplianceSettings(settings);
      toast.success("Calling-window settings saved");
    } catch {
      toast.error("Failed to save");
    }
    setSavingWindow(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
        <span className="text-sm text-neutral-500">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Health banner */}
      {stats?.blocked_from_campaigns ? (
        <div className="flex items-start gap-3 bg-error-50 border border-error-200 rounded-xl px-4 py-3">
          <ShieldAlert className="w-5 h-5 text-error-500 shrink-0 mt-0.5" />
          <div className="text-sm text-error-700">
            <p className="font-semibold">Campaigns paused</p>
            <p className="text-xs mt-0.5">Your opt-out rate ({stats.opt_out_rate}%) is above the safety limit. Clean your lists, then campaigns resume automatically.</p>
          </div>
        </div>
      ) : stats?.flagged ? (
        <div className="flex items-start gap-3 bg-warning-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-warning-500 shrink-0 mt-0.5" />
          <div className="text-sm text-warning-700">
            <p className="font-semibold">Heads up — call health is slipping</p>
            <p className="text-xs mt-0.5">Higher-than-usual opt-outs or very short calls. Review your targeting and scripts.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-success-50 border border-emerald-200 rounded-xl px-4 py-3">
          <ShieldCheck className="w-5 h-5 text-success-600 shrink-0" />
          <p className="text-sm text-success-700 font-medium">Call health looks good.</p>
        </div>
      )}

      {/* Monitoring stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Activity className="w-4 h-4" />} label="Calls (30d)" value={String(stats?.total_calls ?? 0)} />
        <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Opt-out rate" value={`${stats?.opt_out_rate ?? 0}%`}
          accent={(stats?.opt_out_rate ?? 0) >= 5 ? "text-error-600" : "text-neutral-900"} sub={`${stats?.opt_outs ?? 0} opted out`} />
        <StatCard icon={<PhoneOff className="w-4 h-4" />} label="Short calls" value={`${stats?.short_call_rate ?? 0}%`}
          accent={(stats?.short_call_rate ?? 0) >= 40 ? "text-warning-600" : "text-neutral-900"} sub="hung up < 10s" />
        <StatCard icon={<ShieldCheck className="w-4 h-4" />} label="On DNC list" value={String(stats?.dnc_count ?? 0)} />
      </div>

      {/* Calling window */}
      <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-neutral-900">Calling window (quiet hours)</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">When enabled, outbound calls are blocked outside these hours in the chosen timezone.</p>

        <label className="flex items-center gap-2.5 cursor-pointer mb-4">
          <input type="checkbox" className="w-4 h-4 accent-brand-500 rounded"
            checked={!!settings?.calling_window_enabled}
            onChange={e => setSettings((s: any) => ({ ...s, calling_window_enabled: e.target.checked }))} />
          <span className="text-sm text-neutral-700">Enforce calling window</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">From (hour)</label>
            <select className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              value={settings?.calling_start_hour ?? 9}
              onChange={e => setSettings((s: any) => ({ ...s, calling_start_hour: Number(e.target.value) }))}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">To (hour)</label>
            <select className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              value={settings?.calling_end_hour ?? 21}
              onChange={e => setSettings((s: any) => ({ ...s, calling_end_hour: Number(e.target.value) }))}>
              {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">Timezone</label>
            <input className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono"
              value={settings?.calling_timezone ?? "Asia/Kolkata"}
              onChange={e => setSettings((s: any) => ({ ...s, calling_timezone: e.target.value }))} />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={handleSaveWindow} disabled={savingWindow}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {savingWindow ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* DNC list */}
      <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-neutral-900">Do-Not-Call list ({dnc.length})</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">These numbers are skipped on every campaign and blocked on single calls. Callers who ask to be removed are added here automatically.</p>

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <textarea
            value={numbersText}
            onChange={e => setNumbersText(e.target.value)}
            placeholder="Paste numbers to suppress (one per line, or comma-separated)…"
            className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono min-h-[44px] resize-y"
          />
          <button onClick={handleAddDnc} disabled={adding}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-4 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0">
            <Plus className="w-4 h-4" /> Add to DNC
          </button>
        </div>

        {dnc.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-6">No suppressed numbers yet.</p>
        ) : (
          <div className="divide-y divide-neutral-100 max-h-80 overflow-y-auto border border-neutral-200 rounded-xl">
            {dnc.map(r => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-neutral-900">{r.phone_number}</p>
                  <p className="text-[11px] text-neutral-400">
                    {SOURCE_LABEL[r.source] || r.source}{r.reason ? ` · ${r.reason}` : ""}
                  </p>
                </div>
                <button onClick={() => handleRemoveDnc(r.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-error-500 hover:bg-error-50 transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-xs px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-semibold ${accent || "text-neutral-900"}`}>{value}</span>
        {sub && <span className="text-[11px] text-neutral-400 truncate">{sub}</span>}
      </div>
    </div>
  );
}
