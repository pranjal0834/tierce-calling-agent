"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { adminGet, UserRow, Pill, DeleteConfirmModal, PageHeading, LoadingBlock, ExportButton, fmt } from "@/components/admin/ui";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await adminGet("/users")); }
    catch { toast.error("Failed to load users"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.email.toLowerCase().includes(q) || (u.workspace_name || "").toLowerCase().includes(q));
  }, [users, search]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/users/${deleteTarget.id}`);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      toast.success(`Deleted ${deleteTarget.email}`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to delete user");
    } finally {
      setDeleting(false);
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email or workspace…"
          className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
        />
      </div>

      {loading ? <LoadingBlock /> : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500 mb-1">{filtered.length} of {users.length} users</p>
          {filtered.map(u => (
            <div key={u.id} className="group flex items-center gap-4 bg-white border border-neutral-200 rounded-xl shadow-xs px-5 py-3 hover:border-neutral-300 transition-colors">
              <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-xs font-semibold text-brand-600 flex-shrink-0">
                {u.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-900 truncate">{u.email}</p>
                <p className="text-xs text-neutral-400 truncate">{u.workspace_name}</p>
              </div>
              <Pill tone={u.role === "owner" ? "amber" : "blue"}>{u.role}</Pill>
              <span className="text-xs text-neutral-400 hidden md:inline">{fmt(u.created_at)}</span>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${u.is_active ? "bg-emerald-400" : "bg-neutral-300"}`} />
              <button
                onClick={() => setDeleteTarget(u)}
                className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-all duration-150 flex-shrink-0"
                title="Delete account"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-neutral-400 text-center py-10">No users match your search.</p>}
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
    </>
  );
}
