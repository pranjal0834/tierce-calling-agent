"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, Trash2, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { UserRow, Pill, DeleteConfirmModal, PageHeading, LoadingBlock, ExportButton, fmt } from "@/components/admin/ui";
import { SortHeader } from "@/components/admin/SortHeader";
import { Checkbox } from "@/components/admin/Checkbox";

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("search") ?? "") : ""
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"active" | "deleted">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const res = await api.get("/api/admin/users", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          deleted_only: view === "deleted" || undefined,
        },
      });
      setUsers(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setSelected(new Set());
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortBy, sortDir, view]);

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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === users.length && users.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(users.map(u => u.id)));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/users/${deleteTarget.id}`);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      setTotal(prev => prev - 1);
      toast.success(`Deleted ${deleteTarget.email}`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  // Re-enable a merely disabled (not deleted) account.
  const handleEnable = async (user: UserRow) => {
    try {
      await api.put(`/api/admin/users/${user.id}/status`, { is_active: true });
      toast.success(`Enabled ${user.email}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to enable user");
    }
  };

  // Recover a soft-deleted account within its 30-day window.
  const handleRestore = async (user: UserRow) => {
    try {
      await api.post(`/api/admin/users/${user.id}/restore`);
      toast.success(`Restored ${user.email}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to restore user");
    }
  };

  const batchAction = async (action: "enable" | "disable" | "delete") => {
    setBatchLoading(true);
    const ids = Array.from(selected);
    try {
      if (action === "delete") {
        await Promise.all(ids.map(id => api.delete(`/api/admin/users/${id}`)));
        toast.success(`Deleted ${ids.length} user(s)`);
      } else {
        const isActive = action === "enable";
        await Promise.all(ids.map(id => api.put(`/api/admin/users/${id}/status`, { is_active: isActive })));
        toast.success(`${action === "enable" ? "Enabled" : "Disabled"} ${ids.length} user(s)`);
      }
      load();
    } catch {
      toast.error(`Failed to ${action} users`);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <>
      <PageHeading
        title="Users"
        subtitle="All accounts across every workspace"
        action={
          <div className="flex gap-2">
            <ExportButton rows={users as unknown as Record<string, unknown>[]} filename="users" />
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 shrink-0">
          {(["active", "deleted"] as const).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); setPage(1); setSearch(""); }}
              className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${
                view === v ? "bg-brand-50 text-brand-700" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {v === "active" ? "Users" : "Recently Deleted"}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by email or workspace…"
            className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
          />
        </div>
      </div>

      {view === "deleted" && (
        <p className="text-xs text-neutral-500 mt-3 flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
          Deleted accounts stay recoverable for 30 days, then are permanently purged.
        </p>
      )}

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl shadow-xs mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                {view === "active" && (
                  <th className="px-4 py-2.5 w-10">
                    <Checkbox checked={selected.size === users.length && users.length > 0} onChange={toggleSelectAll} />
                  </th>
                )}
                <SortHeader label="Email" field="email" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Role" field="role" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                <SortHeader label={view === "deleted" ? "Deleted" : "Created"} field={view === "deleted" ? "deleted_at" : "created_at"} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                <SortHeader label="Status" field="is_active" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-2.5 w-24 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                  {view === "active" && (
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-xs font-semibold text-brand-600 flex-shrink-0">
                        {u.email[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-neutral-900 truncate">{u.email}</p>
                        <p className="text-xs text-neutral-400 truncate">{u.workspace_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Pill tone={u.role === "owner" ? "amber" : "blue"}>{u.role}</Pill>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap hidden sm:table-cell">{fmt(view === "deleted" ? (u.deleted_at ?? u.created_at) : u.created_at)}</td>
                  <td className="px-4 py-3">
                    {view === "deleted" ? (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${(u.days_left ?? 0) <= 7 ? "text-error-600" : "text-warning-600"}`}>
                        <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                        {u.days_left ?? 0} day{(u.days_left ?? 0) === 1 ? "" : "s"} left
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 text-xs ${u.is_active ? "text-success-600" : "text-neutral-400"}`}>
                        <span className={`w-2 h-2 rounded-full ${u.is_active ? "bg-emerald-400" : "bg-neutral-300"}`} />
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {view === "deleted" ? (
                        <button
                          onClick={() => handleRestore(u)}
                          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-success-600 hover:text-success-700 hover:bg-success-50 transition-all"
                          title="Restore account"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Restore
                        </button>
                      ) : (
                        <>
                          {!u.is_active && (
                            <button
                              onClick={() => handleEnable(u)}
                              className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-success-600 hover:bg-success-50 transition-all"
                              title="Enable account"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            title="Delete account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p className="text-sm text-neutral-400 text-center py-10">No users found.</p>}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-neutral-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          email={deleteTarget.email}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {view === "active" && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 bg-white border border-neutral-200 rounded-xl shadow-lg z-40 animate-fade-in">
          <span className="text-sm text-neutral-700 font-medium">{selected.size} selected</span>
          <div className="w-px h-5 bg-neutral-200" />
          <button
            onClick={() => batchAction("enable")}
            disabled={batchLoading}
            className="text-sm font-medium text-success-600 hover:text-success-700 disabled:opacity-40 transition-colors"
          >
            Enable
          </button>
          <button
            onClick={() => batchAction("disable")}
            disabled={batchLoading}
            className="text-sm font-medium text-warning-600 hover:text-warning-700 disabled:opacity-40 transition-colors"
          >
            Disable
          </button>
          <button
            onClick={() => batchAction("delete")}
            disabled={batchLoading}
            className="text-sm font-medium text-error-600 hover:text-error-700 disabled:opacity-40 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
}
