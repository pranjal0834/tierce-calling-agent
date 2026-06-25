"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Building2, Users, Phone, Bot, DollarSign, Activity, TrendingUp, RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  adminGet, Stats, KpiStat, AnnouncementPanel, PageHeading, LoadingBlock,
} from "@/components/admin/ui";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setStats(await adminGet("/stats")); }
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

      {loading || !stats ? <LoadingBlock /> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <KpiStat label="Workspaces"    value={stats.total_workspaces}   icon={Building2}   tint="bg-brand-50 text-brand-600"     sub={`+${stats.new_workspaces_7d} this week`} />
          <KpiStat label="Users"         value={stats.total_users}        icon={Users}       tint="bg-blue-50 text-blue-600"       />
          <KpiStat label="Total Calls"   value={stats.total_calls}        icon={Phone}       tint="bg-emerald-50 text-emerald-600" sub={`${stats.calls_last_24h} last 24h`} />
          <KpiStat label="Agents"        value={stats.total_agents}       icon={Bot}         tint="bg-purple-50 text-purple-600"   />
          <KpiStat label="Revenue (USD)" value={`$${stats.total_revenue_usd.toFixed(2)}`} icon={DollarSign} tint="bg-amber-50 text-amber-600" />
          <KpiStat label="Calls (24h)"   value={stats.calls_last_24h}     icon={Activity}    tint="bg-cyan-50 text-cyan-600"       />
          <KpiStat label="New (7d)"      value={stats.new_workspaces_7d}  icon={TrendingUp}  tint="bg-pink-50 text-pink-600"       />
        </div>
      )}

      <AnnouncementPanel />
    </>
  );
}
