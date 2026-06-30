"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";
import { adminGet, WsRow, WorkspaceRow, PageHeading, LoadingBlock, ExportButton } from "@/components/admin/ui";

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setWorkspaces(await adminGet("/workspaces")); }
    catch { toast.error("Failed to load workspaces"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter(w => w.name.toLowerCase().includes(q));
  }, [workspaces, search]);

  return (
    <>
      <PageHeading
        title="Workspaces"
        subtitle="Every tenant — adjust credits, enable/disable, inspect members & billing"
        action={
          <div className="flex gap-2">
            <ExportButton rows={workspaces as unknown as Record<string, unknown>[]} filename="workspaces" />
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search workspaces…"
          className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
        />
      </div>

      {loading ? <LoadingBlock /> : (
        <div className="space-y-2.5">
          <p className="text-sm text-neutral-500">{filtered.length} of {workspaces.length} workspaces</p>
          {filtered.map(ws => <WorkspaceRow key={ws.id} ws={ws} onRefresh={load} />)}
          {filtered.length === 0 && <p className="text-sm text-neutral-400 text-center py-10">No workspaces match your search.</p>}
        </div>
      )}
    </>
  );
}
