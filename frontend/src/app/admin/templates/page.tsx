"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Search, LayoutTemplate, Plus, Trash2, X, ArrowUpDown } from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { adminGet, adminPost, adminDelete, PageHeading, KpiStat, Pill, LoadingBlock, fmt } from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface Tpl {
  id: string; name: string; category: string; description: string;
  voice_id: string | null; pipeline_mode: string; tags: string[]; is_official: boolean; created_at: string | null;
}
interface Resp { items: Tpl[]; total: number }

const SORT_FIELDS = [
  { label: "Name", field: "name" },
  { label: "Category", field: "category" },
  { label: "Engine", field: "pipeline_mode" },
  { label: "Created", field: "created_at" },
];

const BLANK = { name: "", category: "Custom", description: "", system_prompt: "", voice_id: "Puck", pipeline_mode: "native", tags: "" };

export default function AdminTemplatesPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{open: boolean; item?: Tpl}>({open: false});
  const formTrapRef = useFocusTrap<HTMLDivElement>(showForm, () => setShowForm(false));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      setData(await adminGet("/templates", {
        params: {
          limit: PAGE_SIZE,
          offset,
          search: search.trim() || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
        },
      }));
    } catch { toast.error("Failed to load templates"); }
    finally { setLoading(false); }
  }, [page, search, sortBy, sortDir]);
  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const templates = data?.items ?? [];

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  async function create() {
    if (!form.name.trim() || !form.system_prompt.trim()) { toast.error("Name and system prompt are required"); return; }
    setSaving(true);
    try {
      await adminPost("/templates", {
        name: form.name, category: form.category, description: form.description,
        system_prompt: form.system_prompt, voice_id: form.voice_id, pipeline_mode: form.pipeline_mode,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      });
      toast.success("Official template published");
      setForm(BLANK); setShowForm(false); load();
    } catch { toast.error("Failed to create template"); }
    finally { setSaving(false); }
  }

  async function remove(t: Tpl) {
    setConfirmDelete({open: true, item: t});
  }

  async function doDelete() {
    const t = confirmDelete.item;
    if (!t) return;
    try { await adminDelete(`/templates/${t.id}`); setData(prev => prev ? { ...prev, items: prev.items.filter(x => x.id !== t.id), total: prev.total - 1 } : prev); toast.success("Deleted"); }
    catch { toast.error("Failed to delete"); }
    finally { setConfirmDelete({open: false}); }
  }

  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10";

  return (
    <>
      <PageHeading
        title="Official Templates"
        subtitle="Publish agent templates that appear in every workspace's template picker"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 h-9 px-3 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
              <Plus className="w-4 h-4" /> New Template
            </button>
            <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 bg-white rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        }
      />

      {loading ? <LoadingBlock /> : (
        <>
          <KpiStat label="Official Templates" value={data?.total ?? 0} icon={LayoutTemplate} tint="bg-brand-50 text-brand-600" />

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name or category…"
                className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all" />
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              {SORT_FIELDS.map(f => {
                const active = sortBy === f.field;
                return (
                  <button key={f.field} onClick={() => handleSort(f.field)}
                    className={`h-7 px-2 rounded-md text-[11px] font-medium border transition-colors whitespace-nowrap
                      ${active
                        ? "bg-brand-50 text-brand-600 border-brand-200"
                        : "text-neutral-500 border-neutral-200 hover:bg-neutral-50 hover:text-neutral-700"}`}>
                    {f.label} {active && (sortDir === "asc" ? "↑" : "↓")}
                  </button>
                );
              })}
            </div>
          </div>

          {templates.length === 0 ? (
            <div className="py-14 text-center text-sm text-neutral-500 rounded-xl border border-dashed border-neutral-200">
              No official templates yet. Click <span className="font-medium">New Template</span> to publish one.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map(t => (
                <div key={t.id} className="rounded-xl border border-neutral-200 bg-white shadow-xs p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 truncate">{t.name}</p>
                      <p className="text-xs text-neutral-400">{t.category} · {t.pipeline_mode}</p>
                    </div>
                    <button onClick={() => remove(t)} className="text-neutral-300 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <p className="text-[13px] text-neutral-500 mt-2 line-clamp-2">{t.description || "No description"}</p>
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    <Pill tone="emerald">Official</Pill>
                    {t.created_at && <span className="text-[11px] text-neutral-400">{fmt(t.created_at)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

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

      <ConfirmModal
        open={confirmDelete.open}
        title="Delete Template"
        message={confirmDelete.item ? `Delete template "${confirmDelete.item.name}"? It will disappear from the user template picker.` : ""}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({open: false})}
      />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="tmpl-modal-title">
          <div ref={formTrapRef} className="w-full max-w-lg bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <h2 id="tmpl-modal-title" className="text-lg font-semibold text-neutral-900">New Official Template</h2>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 overflow-y-auto space-y-3">
              <div><label htmlFor="tmpl-name" className="text-xs text-neutral-500">Name *</label><input id="tmpl-name" className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Solar Lead Qualifier" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="tmpl-category" className="text-xs text-neutral-500">Category</label><input id="tmpl-category" className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                <div><label htmlFor="tmpl-voice" className="text-xs text-neutral-500">Voice</label><input id="tmpl-voice" className={inputCls} value={form.voice_id} onChange={e => setForm({ ...form, voice_id: e.target.value })} /></div>
              </div>
              <div><label htmlFor="tmpl-description" className="text-xs text-neutral-500">Description</label><input id="tmpl-description" className={inputCls} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><label htmlFor="tmpl-tags" className="text-xs text-neutral-500">Tags (comma-separated)</label><input id="tmpl-tags" className={inputCls} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="sales, solar" /></div>
              <div><label htmlFor="tmpl-prompt" className="text-xs text-neutral-500">System prompt *</label><textarea id="tmpl-prompt" className={`${inputCls} h-40 resize-none`} value={form.system_prompt} onChange={e => setForm({ ...form, system_prompt: e.target.value })} placeholder="You are…" /></div>
            </div>
            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 h-9 text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
              <button onClick={create} disabled={saving} className="px-4 h-9 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
