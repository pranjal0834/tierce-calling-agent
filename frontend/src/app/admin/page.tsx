"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Building2, Users, Phone, Bot, DollarSign, Activity, TrendingUp, RefreshCw,
  ArrowRight, FileCheck, AlertTriangle, AlertCircle, Info,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  adminGet, adminPost, Stats, KpiStat, AnnouncementPanel, PageHeading, LoadingBlock,
} from "@/components/admin/ui";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import GeoDistribution from "@/components/admin/GeoDistribution";

// Charts pull in the heavy recharts bundle — defer it (client-only) so it loads
// after the KPI cards render instead of blocking the admin dashboard shell.
const TrendCharts = dynamic(() => import("@/components/admin/TrendCharts"), {
  ssr: false,
  loading: () => <div className="h-56 rounded-2xl bg-neutral-100 animate-pulse" />,
});

// Week-over-week % change from a daily series (last 7 days vs the prior 7).
function wow(series: number[]): number | null {
  if (series.length < 14) return null;
  const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const last7 = sum(series.slice(-7));
  const prev7 = sum(series.slice(-14, -7));
  if (prev7 === 0) return last7 > 0 ? 100 : 0;
  return ((last7 - prev7) / prev7) * 100;
}

interface TrendState {
  calls: number[]; rev: number[];
  callsDelta: number | null; revDelta: number | null;
}

interface Anomaly { level: "critical" | "warning" | "info"; title: string; detail: string }

const ANOMALY_STYLE: Record<Anomaly["level"], { box: string; icon: React.ElementType; iconColor: string }> = {
  critical: { box: "bg-error-50 border-error-200",   icon: AlertCircle,   iconColor: "text-error-500" },
  warning:  { box: "bg-warning-50 border-warning-200", icon: AlertTriangle, iconColor: "text-warning-500" },
  info:     { box: "bg-info-50 border-info-200",      icon: Info,          iconColor: "text-info-500" },
};

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<TrendState>({ calls: [], rev: [], callsDelta: null, revDelta: null });
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, a] = await Promise.all([
        adminGet("/stats"),
        adminGet("/trends?days=14").catch(() => ({ series: [] })),
        adminGet("/anomalies").catch(() => ({ anomalies: [] })),
      ]);
      setStats(s);
      const series: { calls: number; revenue_inr: number }[] = t?.series || [];
      const calls = series.map(p => p.calls ?? 0);
      const rev = series.map(p => p.revenue_inr ?? 0);
      setTrend({ calls, rev, callsDelta: wow(calls), revDelta: wow(rev) });
      setAnomalies(a?.anomalies || []);
    }
    catch { toast.error("Failed to load platform stats"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeading
        title="Platform Overview"
        subtitle="Key metrics across all workspaces, users, and calls"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      <GlobalSearch />

      {!loading && anomalies.length > 0 && (
        <div className="space-y-2" role="region" aria-label="Anomaly alerts">
          {anomalies.map((a, i) => {
            const st = ANOMALY_STYLE[a.level];
            const Icon = st.icon;
            return (
              <div key={i} className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${st.box}`}>
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${st.iconColor}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{a.title}</p>
                  <p className="text-xs text-neutral-600 mt-0.5">{a.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading || !stats ? <LoadingBlock /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiStat label="Workspaces"    value={stats.total_workspaces}   icon={Building2}   tint="bg-brand-50 text-brand-600"     sub={`+${stats.new_workspaces_7d} this week`} href="/admin/workspaces" />
          <KpiStat label="Users"         value={stats.total_users}        icon={Users}       tint="bg-info-50 text-info-600"       href="/admin/users" />
          <KpiStat label="Total Calls"   value={stats.total_calls}        icon={Phone}       tint="bg-success-50 text-success-600" spark={trend.calls} delta={trend.callsDelta} href="/admin/calls" />
          <KpiStat label="Agents"        value={stats.total_agents}       icon={Bot}         tint="bg-purple-50 text-purple-600"   href="/admin/agents" />
          <KpiStat label="Revenue (USD)" value={`$${stats.total_revenue_usd.toFixed(2)}`} icon={DollarSign} tint="bg-warning-50 text-warning-600" spark={trend.rev} delta={trend.revDelta} href="/admin/transactions" />
          <KpiStat label="Calls (24h)"   value={stats.calls_last_24h}     icon={Activity}    tint="bg-cyan-50 text-cyan-600"       href="/admin/calls" />
          <KpiStat label="New (7d)"      value={stats.new_workspaces_7d}  icon={TrendingUp}  tint="bg-pink-50 text-pink-600"       href="/admin/workspaces" />
        </div>
      )}

      {!loading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/admin/workspaces" className="flex items-center gap-3 px-4 py-3 bg-white border border-neutral-200 rounded-xl shadow-xs hover:border-brand-300 hover:shadow-sm transition-all group">
            <Building2 className="icon-md text-neutral-400 group-hover:text-brand-500 transition-colors" />
            <div>
              <p className="text-sm font-medium text-neutral-900">View all workspaces</p>
              <p className="text-xs text-neutral-400">{stats?.total_workspaces ?? "—"} total</p>
            </div>
            <ArrowRight className="icon-sm text-neutral-300 group-hover:text-brand-500 ml-auto transition-colors" />
          </a>
          <a href="/admin/users" className="flex items-center gap-3 px-4 py-3 bg-white border border-neutral-200 rounded-xl shadow-xs hover:border-brand-300 hover:shadow-sm transition-all group">
            <Users className="icon-md text-neutral-400 group-hover:text-brand-500 transition-colors" />
            <div>
              <p className="text-sm font-medium text-neutral-900">Manage users</p>
              <p className="text-xs text-neutral-400">{stats?.total_users ?? "—"} registered</p>
            </div>
            <ArrowRight className="icon-sm text-neutral-300 group-hover:text-brand-500 ml-auto transition-colors" />
          </a>
          <a href="/admin/calls" className="flex items-center gap-3 px-4 py-3 bg-white border border-neutral-200 rounded-xl shadow-xs hover:border-brand-300 hover:shadow-sm transition-all group">
            <Phone className="icon-md text-neutral-400 group-hover:text-brand-500 transition-colors" />
            <div>
              <p className="text-sm font-medium text-neutral-900">View recent calls</p>
              <p className="text-xs text-neutral-400">{stats?.calls_last_24h ?? "—"} in last 24h</p>
            </div>
            <ArrowRight className="icon-sm text-neutral-300 group-hover:text-brand-500 ml-auto transition-colors" />
          </a>
          <a href="/admin/kyc" className="flex items-center gap-3 px-4 py-3 bg-white border border-neutral-200 rounded-xl shadow-xs hover:border-brand-300 hover:shadow-sm transition-all group">
            <FileCheck className="icon-md text-neutral-400 group-hover:text-brand-500 transition-colors" />
            <div>
              <p className="text-sm font-medium text-neutral-900">KYC reviews</p>
              <p className="text-xs text-neutral-400">Pending approvals</p>
            </div>
            <ArrowRight className="icon-sm text-neutral-300 group-hover:text-brand-500 ml-auto transition-colors" />
          </a>
        </div>
      )}

      {!loading && stats && <TrendCharts />}

      {!loading && stats && <GeoDistribution />}

      <DigestCard />

      <AnnouncementPanel />
    </>
  );
}

function DigestCard() {
  const [sending, setSending] = useState(false);
  const sendNow = async () => {
    setSending(true);
    try {
      const r = await adminPost("/digest/send", {});
      toast.success(`Digest emailed to ${r.sent} admin${r.sent === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to send digest");
    } finally { setSending(false); }
  };
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-brand-50 border border-brand-200 rounded-lg flex items-center justify-center">
          <FileCheck className="icon-sm text-brand-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-neutral-900">Scheduled report</p>
          <p className="text-xs text-neutral-500">Platform digest (HTML + CSV) to all admins. Schedule via <code className="font-mono text-[11px]">ADMIN_DIGEST_FREQ</code> (daily/weekly).</p>
        </div>
      </div>
      <button onClick={sendNow} disabled={sending}
        className="inline-flex items-center gap-2 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors disabled:opacity-50 shrink-0">
        <RefreshCw className={`w-4 h-4 ${sending ? "animate-spin" : ""}`} /> {sending ? "Sending…" : "Email me now"}
      </button>
    </div>
  );
}
