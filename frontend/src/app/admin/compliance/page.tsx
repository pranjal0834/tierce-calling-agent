"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, ShieldCheck, ShieldOff, ClipboardCheck, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock } from "@/components/admin/ui";

interface WsCompliance {
  workspace: string; workspace_id: string;
  dnc_count: number; opt_out_count: number; consent_attestations: number;
  calling_window_enabled: boolean; calling_window: string | null;
}
interface Resp {
  workspaces: WsCompliance[];
  summary: { total_dnc: number; total_opt_outs: number; total_consent_attestations: number };
}

export default function AdminCompliancePage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminGet("/compliance")); }
    catch { toast.error("Failed to load compliance data"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeading
        title="Compliance"
        subtitle="DNC lists, opt-outs, consent attestations, and calling windows per workspace"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiStat label="DNC Entries" value={data.summary.total_dnc.toLocaleString("en-IN")} icon={ShieldOff} tint="bg-red-50 text-red-600" sub="suppressed numbers" />
            <KpiStat label="Opt-outs" value={data.summary.total_opt_outs.toLocaleString("en-IN")} icon={ShieldCheck} tint="bg-amber-50 text-amber-600" sub="caller-initiated" />
            <KpiStat label="Consent Attestations" value={data.summary.total_consent_attestations.toLocaleString("en-IN")} icon={ClipboardCheck} tint="bg-emerald-50 text-emerald-600" sub="campaign confirmations" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>{["Workspace", "DNC", "Opt-outs", "Consent", "Calling Window"].map(h => <th key={h} className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.workspaces.map(w => (
                  <tr key={w.workspace_id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{w.workspace}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{w.dnc_count}</td>
                    <td className="px-4 py-2.5">{w.opt_out_count > 0 ? <Pill tone="amber">{w.opt_out_count}</Pill> : <span className="text-neutral-400">0</span>}</td>
                    <td className="px-4 py-2.5 text-neutral-700">{w.consent_attestations}</td>
                    <td className="px-4 py-2.5">
                      {w.calling_window_enabled
                        ? <span className="inline-flex items-center gap-1.5 text-neutral-600"><Clock className="w-3.5 h-3.5 text-emerald-500" />{w.calling_window}</span>
                        : <span className="text-neutral-400">Not set</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.workspaces.length === 0 && (
              <div className="py-14 text-center text-sm text-neutral-500">No workspaces with compliance activity yet</div>
            )}
          </div>
          <p className="text-xs text-neutral-400">Only workspaces with a DNC list, consent attestation, or calling window are shown.</p>
        </>
      )}
    </>
  );
}
