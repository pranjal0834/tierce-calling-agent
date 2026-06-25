"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, RefreshCw, Download, Check, X, FileText, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { adminListKyc, adminApproveKyc, adminRejectKyc, adminDeleteKyc, downloadKycDocAdmin } from "@/lib/api";

interface DocMeta { id: string; doc_type: string; file_name: string; size_bytes: number; }
interface KycRow {
  id: string; workspace_name: string | null; country: string; status: string;
  business_name: string; business_type: string; gstin: string | null;
  address_line: string; city: string; state: string; postal_code: string;
  authorized_name: string; authorized_pan: string | null;
  plivo_bundle_sid: string | null; error_message: string | null;
  doc_count: number; documents: DocMeta[]; updated_at: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending:   "bg-neutral-100 text-neutral-600",
  submitted: "bg-blue-50 text-blue-700",
  approved:  "bg-emerald-50 text-emerald-700",
  rejected:  "bg-red-50 text-red-700",
  failed:    "bg-red-50 text-red-700",
};

export default function AdminKycPage() {
  const [rows, setRows] = useState<KycRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sidInput, setSidInput] = useState<Record<string, string>>({});

  const reload = async () => {
    try {
      setRows(await adminListKyc());
    } catch (e: any) {
      if (e?.response?.status === 403) setDenied(true);
    }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const approve = async (r: KycRow) => {
    const sid = (sidInput[r.id] || "").trim();
    if (!sid) { toast.error("Paste the approved Plivo bundle / compliance ID"); return; }
    try { await adminApproveKyc(r.id, sid); toast.success("Approved"); reload(); }
    catch { toast.error("Failed to approve"); }
  };
  const reject = async (r: KycRow) => {
    const reason = window.prompt("Reason for rejection (shown to the customer):", "");
    if (reason === null) return;
    try { await adminRejectKyc(r.id, reason); toast.success("Rejected"); reload(); }
    catch { toast.error("Failed to reject"); }
  };
  const remove = async (r: KycRow) => {
    if (!window.confirm(`Permanently delete the KYC packet for "${r.business_name || "(no name)"}"?\n\nThis removes the submission and all ${r.doc_count} uploaded document${r.doc_count === 1 ? "" : "s"}. This cannot be undone.`)) return;
    try { await adminDeleteKyc(r.id); toast.success("Deleted"); setRows(rs => rs.filter(x => x.id !== r.id)); }
    catch { toast.error("Failed to delete"); }
  };

  if (loading) return <div className="flex items-center justify-center py-24 gap-2"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /><span className="text-sm text-neutral-500">Loading…</span></div>;
  if (denied) return <div className="p-8 text-center text-sm text-neutral-500">Super-admin access required.</div>;

  const pending = rows.filter(r => r.status === "submitted");
  const others = rows.filter(r => r.status !== "submitted");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">KYC Review</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Review customer compliance packets, relay to Plivo, then approve with the bundle ID</p>
        </div>
        <button onClick={reload} className="inline-flex items-center gap-1.5 h-9 px-3 border border-neutral-200 rounded-lg text-sm hover:bg-neutral-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {rows.length === 0 && <p className="text-sm text-neutral-400 text-center py-10">No KYC submissions yet.</p>}

      {[...pending, ...others].map(r => (
        <div key={r.id} className="bg-white border border-neutral-200 rounded-2xl shadow-sm">
          <button onClick={() => setOpen(open === r.id ? null : r.id)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 truncate">{r.business_name || "(no name)"} <span className="text-neutral-400 font-normal">· {r.country}</span></p>
              <p className="text-xs text-neutral-500">{r.workspace_name} · {r.doc_count} doc{r.doc_count === 1 ? "" : "s"}</p>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[r.status] || "bg-neutral-100 text-neutral-600"}`}>{r.status}</span>
          </button>

          {open === r.id && (
            <div className="px-4 pb-4 space-y-4 border-t border-neutral-100 pt-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <Field label="Entity">{r.business_type}</Field>
                <Field label="GSTIN">{r.gstin || "—"}</Field>
                <Field label="Address">{[r.address_line, r.city, r.state, r.postal_code].filter(Boolean).join(", ")}</Field>
                <Field label="Authorized">{r.authorized_name}{r.authorized_pan ? ` · PAN ${r.authorized_pan}` : ""}</Field>
              </div>

              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Documents</p>
                {r.documents.length === 0 ? <p className="text-xs text-neutral-400">No documents uploaded.</p> : (
                  <div className="space-y-1.5">
                    {r.documents.map(d => (
                      <div key={d.id} className="flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="text-xs text-neutral-700 truncate">{d.doc_type} · {d.file_name}</span>
                        </div>
                        <button onClick={() => downloadKycDocAdmin(d.id, d.file_name)}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 shrink-0">
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {r.status === "approved" ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex-1">
                    <ShieldCheck className="w-4 h-4 shrink-0" /> Approved · bundle <span className="font-mono break-all">{r.plivo_bundle_sid}</span>
                  </div>
                  <button onClick={() => remove(r)} className="inline-flex items-center justify-center gap-1.5 h-9 px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg shrink-0">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={sidInput[r.id] || ""}
                    onChange={e => setSidInput(s => ({ ...s, [r.id]: e.target.value }))}
                    placeholder="Approved Plivo bundle / compliance ID"
                    className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                  <button onClick={() => approve(r)} className="inline-flex items-center justify-center gap-1.5 h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg">
                    <Check className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => reject(r)} className="inline-flex items-center justify-center gap-1.5 h-9 px-4 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg">
                    <X className="w-4 h-4" /> Reject
                  </button>
                  <button onClick={() => remove(r)} title="Delete packet" className="inline-flex items-center justify-center gap-1.5 h-9 px-3 border border-neutral-200 text-neutral-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 text-sm font-medium rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {r.error_message && r.status === "rejected" && (
                <p className="text-xs text-red-600 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> {r.error_message}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-neutral-400 uppercase tracking-wide">{label}</p>
      <p className="text-neutral-800 truncate">{children}</p>
    </div>
  );
}
