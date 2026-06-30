"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, MessageCircle, CheckCircle2, Bot } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock } from "@/components/admin/ui";

interface WsRow { workspace: string; workspace_id: string; connected: boolean; enabled_agents: number; total_agents: number }
interface Resp { workspaces: WsRow[]; summary: { connected_workspaces: number; shown: number } }

export default function AdminWhatsAppPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminGet("/whatsapp")); }
    catch { toast.error("Failed to load WhatsApp usage"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeading
        title="WhatsApp"
        subtitle="Which workspaces have connected WhatsApp and how many agents use it"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading || !data ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <KpiStat label="Connected" value={data.summary.connected_workspaces} icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" sub="workspaces with WhatsApp" />
            <KpiStat label="Using WhatsApp" value={data.summary.shown} icon={MessageCircle} tint="bg-brand-50 text-brand-600" sub="connected or enabled" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>{["Workspace", "Connected", "Enabled Agents", "Total Agents"].map(h => <th key={h} className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.workspaces.map(w => (
                  <tr key={w.workspace_id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{w.workspace}</td>
                    <td className="px-4 py-2.5">{w.connected ? <Pill tone="emerald">Connected</Pill> : <Pill tone="neutral">Not connected</Pill>}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-neutral-700"><Bot className="w-3.5 h-3.5 text-neutral-400" />{w.enabled_agents}</span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500">{w.total_agents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.workspaces.length === 0 && <div className="py-14 text-center text-sm text-neutral-500">No workspaces using WhatsApp yet</div>}
          </div>
          <p className="text-xs text-neutral-400">WhatsApp is a paid add-on — only workspaces that connected their own number or enabled it on an agent are shown.</p>
        </>
      )}
    </>
  );
}
