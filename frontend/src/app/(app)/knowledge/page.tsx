"use client";
import { useEffect, useState, useRef } from "react";
import {
  BookOpen, Plus, Trash2, FileText, Globe, Type, UploadCloud,
  ChevronLeft, CheckCircle2, AlertCircle, X, Loader2, Eye, User as UserIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import ConfirmModal from "@/components/ui/ConfirmModal";
import {
  getKnowledgeBases, createKnowledgeBase, getKnowledgeBase, deleteKnowledgeBase,
  addKbTextDoc, addKbUrlDoc, uploadKbPdf, deleteKbDoc, getKbDocContent,
} from "@/lib/api";

interface KB {
  id: string; name: string; description?: string;
  document_count: number; ready_count: number; created_at?: string;
}
interface KbDoc {
  id: string; source_type: "pdf" | "url" | "text"; title: string;
  source_ref?: string; status: "processing" | "ready" | "failed";
  error_message?: string; char_count: number; chunk_count: number; created_at?: string;
  uploaded_by?: string | null;
}

const SOURCE_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  pdf:  { icon: FileText, label: "PDF",     color: "text-error-600",     bg: "bg-error-50" },
  url:  { icon: Globe,    label: "Website", color: "text-info-600",    bg: "bg-info-50" },
  text: { icon: Type,     label: "Text",    color: "text-violet-600",  bg: "bg-violet-50" },
};

function StatusPill({ status }: { status: KbDoc["status"] }) {
  if (status === "ready")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success-50 text-success-700 border border-success-200"><CheckCircle2 className="w-3 h-3" /> Ready</span>;
  if (status === "failed")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-error-50 text-error-700 border border-error-200"><AlertCircle className="w-3 h-3" /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning-50 text-warning-700 border border-warning-200"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>;
}

export default function KnowledgePage() {
  const [kbs, setKbs] = useState<KB[]>([]);
  const [selected, setSelected] = useState<KB | null>(null);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KbDoc | null>(null);
  const [confirmDeleteKb, setConfirmDeleteKb] = useState<{open: boolean; item?: KB}>({open: false});
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{open: boolean; item?: KbDoc}>({open: false});

  const loadKbs = () => getKnowledgeBases().then(setKbs).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { loadKbs(); }, []);

  const openKb = async (kb: KB) => {
    setSelected(kb);
    setDocs([]);
    try {
      const d = await getKnowledgeBase(kb.id);
      setDocs(d.documents || []);
    } catch { toast.error("Failed to load documents"); }
  };

  const refreshDocs = async () => {
    if (!selected) return;
    try {
      const d = await getKnowledgeBase(selected.id);
      setDocs(d.documents || []);
    } catch { /* silent */ }
  };

  // Auto-refresh while any document is still processing
  useEffect(() => {
    if (!selected) return;
    const hasProcessing = docs.some(d => d.status === "processing");
    if (!hasProcessing) return;
    const t = setInterval(refreshDocs, 3000);
    return () => clearInterval(t);
  }, [selected, docs]);

  const handleDeleteKb = async (kb: KB) => {
    setConfirmDeleteKb({open: true, item: kb});
  };

  const doDeleteKb = async () => {
    const kb = confirmDeleteKb.item;
    if (!kb) return;
    try {
      await deleteKnowledgeBase(kb.id);
      setKbs(prev => prev.filter(k => k.id !== kb.id));
      if (selected?.id === kb.id) { setSelected(null); setDocs([]); }
      toast.success("Knowledge base deleted");
    } catch { toast.error("Failed to delete"); }
    finally { setConfirmDeleteKb({open: false}); }
  };

  const handleDeleteDoc = async (doc: KbDoc) => {
    if (!selected) return;
    setConfirmDeleteDoc({open: true, item: doc});
  };

  const doDeleteDoc = async () => {
    const doc = confirmDeleteDoc.item;
    if (!selected || !doc) return;
    try {
      await deleteKbDoc(selected.id, doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      toast.success("Document removed");
    } catch { toast.error("Failed to remove document"); }
    finally { setConfirmDeleteDoc({open: false}); }
  };

  return (
    <div className="space-y-6">
      {/* Page actions */}
      {!selected && (
        <div className="flex items-center justify-end gap-3 flex-wrap">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" /> New Knowledge Base
          </button>
        </div>
      )}

      {/* ── KB LIST ── */}
      {!selected && (
        loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : kbs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 bg-white border border-dashed border-neutral-300 rounded-2xl">
            <div className="w-12 h-12 bg-brand-50 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-brand-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-neutral-700">No knowledge bases yet</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-xs">Create one and add PDFs, website links, or text. Then attach it to an agent so it can answer beyond its prompt.</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" /> New Knowledge Base
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {kbs.map(kb => (
              <div
                key={kb.id}
                onClick={() => openKb(kb)}
                className="group bg-white border border-neutral-200 rounded-xl shadow-card p-5 cursor-pointer hover:shadow-hover hover:border-neutral-300 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-brand-500" />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteKb(kb); }}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-error-500 hover:bg-error-50 transition-all"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm font-semibold text-neutral-900 mt-3 truncate">{kb.name}</p>
                {kb.description && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{kb.description}</p>}
                <div className="flex items-center gap-3 mt-3 text-xs text-neutral-400">
                  <span>{kb.document_count} doc{kb.document_count !== 1 ? "s" : ""}</span>
                  {kb.ready_count > 0 && <span className="text-success-600">{kb.ready_count} ready</span>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── KB DETAIL ── */}
      {selected && (
        <div className="space-y-4">
          <button
            onClick={() => { setSelected(null); setDocs([]); loadKbs(); }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to knowledge bases
          </button>

          <div className="bg-white border border-neutral-200 rounded-xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-brand-500 shrink-0" />
                  <h2 className="text-sm font-semibold text-neutral-900 truncate">{selected.name}</h2>
                </div>
                {selected.description && <p className="text-xs text-neutral-500 mt-0.5">{selected.description}</p>}
              </div>
              <button
                onClick={() => setShowAddDoc(true)}
                className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg shadow-xs transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" /> Add Document
              </button>
            </div>

            {docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                <div className="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-neutral-400" />
                </div>
                <p className="text-sm font-medium text-neutral-600">No documents yet</p>
                <p className="text-xs text-neutral-400">Add a PDF, website URL, or paste text to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {docs.map(doc => {
                  const meta = SOURCE_META[doc.source_type] ?? SOURCE_META.text;
                  const Icon = meta.icon;
                  return (
                    <div key={doc.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-neutral-50/60 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-4 h-4 ${meta.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{doc.title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <StatusPill status={doc.status} />
                            {doc.status === "ready" && (
                              <span className="text-[10px] text-neutral-400">{doc.chunk_count} chunks · {(doc.char_count / 1000).toFixed(1)}k chars</span>
                            )}
                            {doc.uploaded_by && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400" title={`Uploaded by ${doc.uploaded_by}`}>
                                <UserIcon className="w-3 h-3" /> {doc.uploaded_by}
                              </span>
                            )}
                            {doc.status === "failed" && doc.error_message && (
                              <span className="text-[10px] text-error-500 truncate max-w-[200px]" title={doc.error_message}>{doc.error_message}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.status === "ready" && (
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title="Preview content"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteDoc(doc)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-error-500 hover:bg-error-50 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateKbModal
          onClose={() => setShowCreate(false)}
          onCreated={(kb) => { setKbs(prev => [kb, ...prev]); setShowCreate(false); openKb(kb); }}
        />
      )}
      {showAddDoc && selected && (
        <AddDocModal
          kbId={selected.id}
          onClose={() => setShowAddDoc(false)}
          onAdded={(doc) => { setDocs(prev => [doc, ...prev]); setShowAddDoc(false); }}
        />
      )}
      {previewDoc && selected && (
        <PreviewDocModal
          kbId={selected.id}
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
      <ConfirmModal
        open={confirmDeleteKb.open}
        title="Delete Knowledge Base"
        message={confirmDeleteKb.item ? `Delete "${confirmDeleteKb.item.name}" and all its documents? This cannot be undone.` : ""}
        onConfirm={doDeleteKb}
        onCancel={() => setConfirmDeleteKb({open: false})}
      />
      <ConfirmModal
        open={confirmDeleteDoc.open}
        title="Remove Document"
        message={confirmDeleteDoc.item ? `Remove "${confirmDeleteDoc.item.title}" from this knowledge base?` : ""}
        onConfirm={doDeleteDoc}
        onCancel={() => setConfirmDeleteDoc({open: false})}
      />
    </div>
  );
}

// ── Document preview modal ──────────────────────────────────────────────────────

function PreviewDocModal({ kbId, doc, onClose }: { kbId: string; doc: KbDoc; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    getKbDocContent(kbId, doc.id)
      .then(setData)
      .catch(() => toast.error("Failed to load content"))
      .finally(() => setLoading(false));
  }, [kbId, doc.id]);

  const meta = SOURCE_META[doc.source_type] ?? SOURCE_META.text;
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-modal w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col animate-scale-in">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-4 h-4 ${meta.color}`} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-neutral-900 truncate">{doc.title}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-neutral-400">
                <span>{meta.label}</span>
                {doc.source_ref && <span className="truncate max-w-[200px]">· {doc.source_ref}</span>}
                {doc.uploaded_by && <span className="inline-flex items-center gap-1">· <UserIcon className="w-3 h-3" /> {doc.uploaded_by}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <p className="text-[11px] text-neutral-400 mb-3">
                {doc.chunk_count} chunks · {(doc.char_count / 1000).toFixed(1)}k chars — this is the exact text the agent searches during calls.
              </p>
              <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-700 font-sans">
                {(data?.content || "").trim() || "No extractable content."}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Create KB modal ─────────────────────────────────────────────────────────────

function CreateKbModal({ onClose, onCreated }: { onClose: () => void; onCreated: (kb: KB) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const kb = await createKnowledgeBase({ name: name.trim(), description: description.trim() });
      toast.success("Knowledge base created");
      onCreated(kb);
    } catch { toast.error("Failed to create"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-modal w-full sm:max-w-md animate-scale-in">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-neutral-900">New Knowledge Base</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="label-base">Name</label>
            <input className="input-base" placeholder="e.g. Product Docs, Company FAQ" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label-base">Description <span className="text-neutral-400 font-normal">(optional)</span></label>
            <input className="input-base" placeholder="What's in this knowledge base?" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5">
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={save} disabled={saving} className="h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium shadow-xs transition-colors disabled:opacity-50">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add document modal ──────────────────────────────────────────────────────────

function AddDocModal({ kbId, onClose, onAdded }: { kbId: string; onClose: () => void; onAdded: (doc: KbDoc) => void }) {
  const [tab, setTab] = useState<"pdf" | "url" | "text">("pdf");
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const submit = async () => {
    setSaving(true);
    try {
      let doc: KbDoc;
      if (tab === "pdf") {
        if (!file) { toast.error("Choose a PDF file"); setSaving(false); return; }
        doc = await uploadKbPdf(kbId, file);
      } else if (tab === "url") {
        if (!url.trim()) { toast.error("Enter a URL"); setSaving(false); return; }
        doc = await addKbUrlDoc(kbId, { url: url.trim(), title: title.trim() });
      } else {
        if (!content.trim()) { toast.error("Enter some text"); setSaving(false); return; }
        doc = await addKbTextDoc(kbId, { title: title.trim() || "Untitled note", content });
      }
      toast.success("Document added — processing…");
      onAdded(doc);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to add document");
    } finally { setSaving(false); }
  };

  const TABS = [
    { key: "pdf",  label: "Upload PDF",  icon: UploadCloud },
    { key: "url",  label: "Website URL", icon: Globe },
    { key: "text", label: "Paste Text",  icon: Type },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-modal w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-[15px] font-semibold text-neutral-900">Add Document</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Source tabs */}
        <div className="flex gap-1 px-4 pt-4 overflow-x-auto flex-shrink-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key ? "bg-brand-50 text-brand-700" : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {tab === "pdf" && (
            <div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)} />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-neutral-300 rounded-xl px-4 py-8 flex flex-col items-center gap-2 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
              >
                <UploadCloud className="w-7 h-7 text-neutral-400" />
                <p className="text-sm font-medium text-neutral-700">{file ? file.name : "Click to choose a PDF"}</p>
                <p className="text-xs text-neutral-400">Max 20 MB</p>
              </button>
            </div>
          )}
          {tab === "url" && (
            <>
              <div>
                <label className="label-base">Website URL</label>
                <input className="input-base" placeholder="https://yourcompany.com/about" value={url} onChange={e => setUrl(e.target.value)} />
              </div>
              <div>
                <label className="label-base">Title <span className="text-neutral-400 font-normal">(optional)</span></label>
                <input className="input-base" placeholder="Auto-detected from the page if blank" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
            </>
          )}
          {tab === "text" && (
            <>
              <div>
                <label className="label-base">Title</label>
                <input className="input-base" placeholder="e.g. Refund Policy" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="label-base">Content</label>
                <textarea className="input-base min-h-[160px] resize-none" placeholder="Paste any text, FAQ, or notes the agent should know…" value={content} onChange={e => setContent(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5 flex-shrink-0">
          <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving} className="h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium shadow-xs transition-colors disabled:opacity-50">
            {saving ? "Adding…" : "Add Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
