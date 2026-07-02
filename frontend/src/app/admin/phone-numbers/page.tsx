"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, Hash, Phone, Wallet, AlertTriangle, CheckCircle2, ChevronDown, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";
import { Checkbox } from "@/components/admin/Checkbox";
import { api } from "@/lib/api";

const PAGE_SIZE = 50;

interface NumRow {
  id: string; phone_number: string; workspace_name: string; provider: string;
  is_active: boolean; is_suspended: boolean; auto_renew: boolean;
  monthly_cost_inr: number; purchased_at: string | null; renews_at: string | null;
}

export default function AdminPhoneNumbersPage() {
  const [rows, setRows] = useState<NumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("search") ?? "") : ""
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("purchased_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const resp = await adminGet("/phone-numbers", {
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
      toast.error("Failed to load phone numbers");
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

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.id)));
    }
  };

  const batchRelease = async () => {
    setBatchLoading(true);
    const ids = Array.from(selected);
    try {
      await Promise.all(ids.map(id => api.delete(`/api/phone-numbers/${id}`)));
      toast.success(`Released ${ids.length} number(s)`);
      setSelected(new Set());
      load();
    } catch {
      toast.error("Failed to release numbers");
    } finally {
      setBatchLoading(false);
    }
  };

  const summary = useMemo(() => {
    const active = rows.filter(n => n.is_active && !n.is_suspended).length;
    const suspended = rows.filter(n => n.is_suspended).length;
    const price = rows[0]?.monthly_cost_inr ?? 0;
    return { total, active, suspended, number_price_inr: price, monthly_liability_inr: active * price };
  }, [rows, total]);

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
        title="Phone Numbers"
        subtitle="Every purchased number across all workspaces — and your monthly cost liability"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {loading ? <LoadingBlock /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiStat label="Total Numbers" value={summary.total} icon={Hash} tint="bg-brand-50 text-brand-600" />
            <KpiStat label="Active" value={summary.active} icon={CheckCircle2} tint="bg-success-50 text-success-600" />
            <KpiStat label="Suspended" value={summary.suspended} icon={AlertTriangle} tint="bg-error-50 text-error-600" />
            <KpiStat label="Monthly Liability" value={`₹${summary.monthly_liability_inr.toLocaleString("en-IN")}`} icon={Wallet} tint="bg-amber-50 text-amber-600" sub={`₹${summary.number_price_inr}/number`} />
          </div>

          <div className="relative max-w-sm mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search number or workspace…"
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
                <tr>
                  <th className="px-4 py-2.5 w-10">
                    <Checkbox checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Number" field="phone_number" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Workspace" field="workspace_name" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Provider" field="provider" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Status" field="is_active" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Renews" field="renews_at" /></th>
                  <th className="px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap"><SortLabel label="Monthly" field="monthly_cost_inr" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map(n => (
                  <tr key={n.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2.5">
                      <Checkbox checked={selected.has(n.id)} onChange={() => toggleSelect(n.id)} />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-neutral-900 whitespace-nowrap">{n.phone_number}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{n.workspace_name}</td>
                    <td className="px-4 py-2.5 text-neutral-500 capitalize">{n.provider}</td>
                    <td className="px-4 py-2.5">
                      {n.is_suspended ? <Pill tone="red">Suspended</Pill> : n.is_active ? <Pill tone="emerald">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}
                      {!n.auto_renew && <span className="ml-1.5 text-[11px] text-neutral-400">no auto-renew</span>}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{n.renews_at ? fmt(n.renews_at) : "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-700">₹{n.monthly_cost_inr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Phone className="w-7 h-7 text-neutral-300" />
                <p className="text-sm font-medium text-neutral-500">No numbers found</p>
              </div>
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
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 bg-white border border-neutral-200 rounded-xl shadow-lg z-40 animate-fade-in">
          <span className="text-sm text-neutral-700 font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-neutral-200" />
          <button onClick={batchRelease} disabled={batchLoading}
            className="h-8 px-3 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Release
          </button>
        </div>
      )}
    </>
  );
}
