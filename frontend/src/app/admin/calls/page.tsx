"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, CallRow, AdminCallRow, PageHeading, LoadingBlock } from "@/components/admin/ui";

export default function AdminCallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setCalls(await adminGet("/calls")); }
    catch { toast.error("Failed to load calls"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter(c => c.phone_number.toLowerCase().includes(q) || (c.workspace_name || "").toLowerCase().includes(q));
  }, [calls, search]);

  return (
    <>
      <PageHeading
        title="Calls"
        subtitle="Recent calls across all workspaces — tap a row for its cost breakdown"
        action={
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search number or workspace…"
          className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
        />
      </div>

      {loading ? <LoadingBlock /> : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500 mb-1">{filtered.length} of {calls.length} calls</p>
          {filtered.map(c => <AdminCallRow key={c.id} c={c} />)}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
                <Phone className="w-7 h-7 text-neutral-400" />
              </div>
              <p className="text-sm font-medium text-neutral-500">No calls found</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
