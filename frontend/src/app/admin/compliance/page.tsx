"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, ShieldCheck, ShieldOff, ClipboardCheck, Clock, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock } from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface WsCompliance {
  workspace: string; workspace_id: string;
  dnc_count: number; opt_out_count: number; consent_attestations: number;
  calling_window_enabled: boolean; calling_window: string | null;
}

export default function AdminCompliancePage() {
  const [rows, setRows] = useState<WsCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("workspace");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await adminGet("/compliance", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      });
      setRows(resp.items ?? []);
      setTotal(resp.total ?? 0);
    } catch {
      toast.error("Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  function SortLabel({ label, field }: { label: string; field: string }) {
    const active = sortBy === field;
    return (
      <span className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort(field)}>
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${active ? (sortDir === "asc" ? "rotate-180" : "") : "opacity-0"}`} />
      </span>
    );
  }

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

      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiStat label="DNC Entries" value={rows.reduce((s, w) => s + w.dnc_count, 0).toLocaleString("en-IN")} icon={ShieldOff} tint="bg-red-50 text-red-600" sub="suppressed numbers" />
            <KpiStat label="Opt-outs" value={rows.reduce((s, w) => s + w.opt_out_count, 0).toLocaleString("en-IN")} icon={ShieldCheck} tint="bg-amber-50 text-amber-600" sub="caller-initiated" />
            <KpiStat label="Consent Attestations" value={rows.reduce((s, w) => s + w.consent_attestations, 0).toLocaleString("en-IN")} icon={ClipboardCheck} tint="bg-emerald-50 text-emerald-600" sub="campaign confirmations" />
          </div>

          <div className="relative max-w-sm mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search workspace…"
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Workspace" field="workspace" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="DNC" field="dnc_count" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Opt-outs" field="opt_out_count" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Consent" field="consent_attestations" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap">Calling Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(w => (
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
            {rows.length === 0 && (
              <div className="py-14 text-center text-sm text-neutral-500">No workspaces with compliance activity yet</div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-neutral-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">Previous</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
          <p className="text-xs text-neutral-400">Only workspaces with a DNC list, consent attestation, or calling window are shown.</p>
        </>
      )}
    </>
  );
}
