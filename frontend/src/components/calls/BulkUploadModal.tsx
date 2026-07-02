"use client";
import { useState, useRef } from "react";
import { Users, X, FileSpreadsheet } from "lucide-react";
import { bulkCall } from "@/lib/api";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Contact, parseFile, parseTextNumbers, FREE_PLAN_BULK_LIMIT } from "./calls-utils";
import toast from "react-hot-toast";

export default function BulkUploadModal({ agents, plan, onClose, onLaunched }: {
  agents: any[];
  plan?: string;
  onClose: () => void;
  onLaunched: (count: number, suppressed: number) => void;
}) {
  const isFree = plan === "free";
  const [tab, setTab] = useState<"file" | "paste">("file");
  const [agentId, setAgentId] = useState(agents[0]?.id || "");
  const [callsPerSecond, setCallsPerSecond] = useState(1);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [consent, setConsent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkTrapRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const handleFile = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
    const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const parsed = await parseFile(file);
      setContacts(parsed);
      if (parsed.length === 0) toast.error("No valid phone numbers found in the file");
    } catch {
      toast.error("Failed to parse file");
    }
    setParsing(false);
  };

  const handlePasteParse = () => {
    const parsed = parseTextNumbers(pasteText);
    setContacts(parsed);
    if (parsed.length === 0) toast.error("No valid phone numbers found");
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  };

  const overFreeLimit = isFree && contacts.length > FREE_PLAN_BULK_LIMIT;

  const handleStart = async () => {
    if (!agentId) { toast.error("Select an agent"); return; }
    if (contacts.length === 0) { toast.error("No contacts loaded"); return; }
    if (overFreeLimit) {
      toast.error(`Free plan allows up to ${FREE_PLAN_BULK_LIMIT} contacts per campaign. Upgrade to call more.`);
      return;
    }
    if (!consent) { toast.error("Please confirm you have consent to call these contacts"); return; }
    setLoading(true);
    try {
      const res = await bulkCall({
        agent_id: agentId, contacts, calls_per_second: callsPerSecond, consent_attested: consent,
      });
      onLaunched(res?.queued ?? contacts.length, res?.suppressed ?? 0);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to start campaign", { duration: 6000 });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-modal-title">
      <div ref={bulkTrapRef} className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-lg w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-neutral-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 id="bulk-modal-title" className="text-lg font-semibold text-neutral-900">Bulk Call Campaign</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Upload CSV/Excel or paste numbers</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="bulk-agent" className="text-sm text-neutral-700 font-medium">Agent</label>
              <select
                id="bulk-agent"
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
              >
                <option value="">Select agent...</option>
                {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="bulk-cps" className="text-sm text-neutral-700 font-medium">Calls/second</label>
              <input id="bulk-cps" type="number" min={0.1} max={5} step={0.5}
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm"
                value={callsPerSecond}
                onChange={e => setCallsPerSecond(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="flex gap-2 border-b border-neutral-200" role="tablist">
            {(["file", "paste"] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} aria-controls={`bulk-tabpanel-${t}`} id={`bulk-tab-${t}`}
                onClick={() => { setTab(t); setContacts([]); setFileName(""); setPasteText(""); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? "border-brand-500 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}>
                {t === "file" ? "Upload File" : "Paste Numbers"}
              </button>
            ))}
          </div>

          {tab === "file" && (
            <div role="tabpanel" id="bulk-tabpanel-file" aria-labelledby="bulk-tab-file">
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  dragOver ? "border-brand-500 bg-brand-50" : "border-neutral-300 hover:border-brand-500"
                }`}>
                <FileSpreadsheet className="w-10 h-10 text-neutral-400 mx-auto mb-2" />
                <p className="text-sm text-neutral-700">{fileName ? fileName : "Click or drag a CSV or Excel file"}</p>
                <p className="text-xs text-neutral-500 mt-1">Any layout works — we auto-detect phone numbers (name, company, email picked up if present)</p>
              </div>
              {parsing && <p className="text-sm text-neutral-500 text-center mt-2">Parsing file...</p>}
            </div>
          )}

          {tab === "paste" && (
            <div role="tabpanel" id="bulk-tabpanel-paste" aria-labelledby="bulk-tab-paste" className="space-y-2">
              <textarea
                className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-neutral-900 text-sm min-h-[140px] resize-none font-mono"
                placeholder={"+91 9876543210\n+1 555 123 4567\n..."}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <button onClick={handlePasteParse}
                className="px-4 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm">
                Parse Numbers
              </button>
            </div>
          )}

          {contacts.length > 0 && (
            <div>
              <p className="text-sm font-medium text-neutral-900 mb-2">{contacts.length} contacts loaded</p>
              <div className="bg-neutral-50 rounded-lg overflow-hidden max-h-40 overflow-y-auto border border-neutral-200">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-neutral-500">#</th>
                      <th className="px-3 py-2 text-left text-neutral-500">Phone</th>
                      <th className="px-3 py-2 text-left text-neutral-500">Name</th>
                      <th className="px-3 py-2 text-left text-neutral-500">Company</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {contacts.slice(0, 200).map((c, i) => (
                      <tr key={i} className="hover:bg-neutral-100">
                        <td className="px-3 py-1.5 text-neutral-400">{i + 1}</td>
                        <td className="px-3 py-1.5 text-neutral-900 font-mono">{c.phone_number}</td>
                        <td className="px-3 py-1.5 text-neutral-600">{c.name || "—"}</td>
                        <td className="px-3 py-1.5 text-neutral-600">{c.company || "—"}</td>
                      </tr>
                    ))}
                    {contacts.length > 200 && (
                      <tr><td colSpan={4} className="px-3 py-2 text-neutral-500 text-center">+{contacts.length - 200} more…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {isFree && (
            <div className={`rounded-xl p-3 text-xs leading-relaxed border ${overFreeLimit ? "bg-error-50 border-red-200 text-error-700" : "bg-info-50 border-blue-200 text-info-700"}`}>
              {overFreeLimit
                ? <>Your free plan allows up to <span className="font-semibold">{FREE_PLAN_BULK_LIMIT} contacts</span> per campaign — you loaded {contacts.length}. <a href="/billing" className="font-semibold underline">Upgrade</a> to call more.</>
                : <>Free plan: up to <span className="font-semibold">{FREE_PLAN_BULK_LIMIT} contacts</span> per bulk campaign. <a href="/billing" className="font-semibold underline">Upgrade</a> for unlimited.</>}
            </div>
          )}

          <label htmlFor="bulk-consent" className="flex items-start gap-2.5 cursor-pointer bg-warning-50 border border-amber-200 rounded-xl p-3">
            <input
              id="bulk-consent"
              type="checkbox"
              className="mt-0.5 w-4 h-4 accent-amber-600 rounded"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            <span className="text-xs text-warning-800 leading-relaxed">
              I confirm I have <span className="font-semibold">consent or an existing business relationship</span> to call
              these contacts, and that this campaign complies with TRAI/DLT and applicable telecom regulations.
              Numbers on your Do-Not-Call list are skipped automatically.
            </span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900">Cancel</button>
          <button
            onClick={handleStart}
            disabled={loading || contacts.length === 0 || !agentId || !consent || overFreeLimit}
            className="px-5 py-2 bg-success-600 hover:bg-success-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            {loading ? "Starting..." : `Call ${contacts.length || ""} Contacts`}
          </button>
        </div>
      </div>
    </div>
  );
}
