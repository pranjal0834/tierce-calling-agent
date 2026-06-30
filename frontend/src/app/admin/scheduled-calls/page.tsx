"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, CalendarClock, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";

interface Sched {
  id: string; workspace_name: string; phone_number: string; contact_name: string | null;
  scheduled_at: string | null; status: string; error_message: string | null; call_id: string | null;
}
interface Resp { scheduled: Sched[]; summary: Record<string, number> }

const TONE: Record<string, "blue" | "emerald" | "red" | "amber" | "neutral"> = {
  pending: "blue", running: "amber", completed: "emerald", failed: "red", cancelled: "neutral",
};

export default function AdminScheduledPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminGet("/scheduled-calls")); }
    catch { toast.error("Failed to load scheduled calls"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const rows = data?.scheduled ?? [];
    return filter === "all" ? rows : rows.filter(s => s.status === filter);
  }, [data, filter]);

  const sum = data?.summary ?? {};

  return (
    <>
      <PageHeading
        title="Scheduled Calls"
        subtitle="Upcoming and failed scheduled calls across all workspaces"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiStat label="Pending" value={sum.pending ?? 0} icon={Clock} tint="bg-blue-50 text-info-600" />
            <KpiStat label="Failed" value={sum.failed ?? 0} icon={AlertTriangle} tint={(sum.failed ?? 0) > 0 ? "bg-error-50 text-error-600" : "bg-neutral-100 text-neutral-500"} />
            <KpiStat label="Completed" value={sum.completed ?? 0} icon={CheckCircle2} tint="bg-success-50 text-success-600" />
            <KpiStat label="Total" value={data.scheduled.length} icon={CalendarClock} tint="bg-brand-50 text-brand-600" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {["all", "pending", "failed", "completed", "cancelled"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`h-9 px-3 rounded-lg text-xs font-medium border capitalize transition-colors ${filter === f ? "bg-brand-50 text-brand-600 border-brand-200" : "text-neutral-600 border-neutral-200 hover:bg-neutral-50"}`}>
                {f}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>{["Scheduled", "Workspace", "Contact", "Number", "Status", "Error"].map(h => <th key={h} className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(s => (
                  <tr key={s.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5 text-neutral-600 whitespace-nowrap">{s.scheduled_at ? fmt(s.scheduled_at) : "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{s.workspace_name}</td>
                    <td className="px-4 py-2.5 text-neutral-500">{s.contact_name || "—"}</td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">{s.phone_number}</td>
                    <td className="px-4 py-2.5"><Pill tone={TONE[s.status] ?? "neutral"}>{s.status}</Pill></td>
                    <td className="px-4 py-2.5 text-error-500 text-xs max-w-[220px] truncate" title={s.error_message ?? ""}>{s.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No scheduled calls</div>}
          </div>
        </>
      )}
    </>
  );
}
