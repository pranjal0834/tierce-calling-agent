"use client";
import { useEffect, useState } from "react";
import {
  CalendarClock, Plus, Users, X, Phone, User,
  CheckCircle2, XCircle, Clock, Loader2, AlertCircle,
  FileSpreadsheet, Trash2, ExternalLink,
} from "lucide-react";
import {
  getScheduledCalls, scheduleCall, bulkScheduleCall,
  cancelScheduledCall, getAgents,
} from "@/lib/api";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduledCall {
  id: string;
  agent_id: string;
  phone_number: string;
  contact_name?: string | null;
  contact_email?: string | null;
  scheduled_at: string;
  timezone: string;
  status: string;
  call_id?: string | null;
  error_message?: string | null;
  notes?: string | null;
  created_at: string;
}

interface BulkContact {
  phone_number: string;
  name?: string;
  email?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const IST = "Asia/Kolkata";

function toUTC(iso: string) {
  return iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
}

function fmtScheduled(iso: string) {
  const d = new Date(toUTC(iso));
  return d.toLocaleString("en-GB", {
    timeZone: IST, weekday: "short", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

// Convert datetime-local value (local browser time) to UTC ISO string
function localToUtcIso(dtLocal: string): string {
  return new Date(dtLocal).toISOString();
}

// Min value for datetime-local input: now (rounded to current minute)
function nowLocalMin(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  // Format as YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:   { label: "Pending",   cls: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",  icon: <Clock className="w-3 h-3" /> },
  running:   { label: "Running",   cls: "text-blue-400 bg-blue-400/10 border-blue-400/30",         icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  completed: { label: "Completed", cls: "text-green-400 bg-green-400/10 border-green-400/30",      icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:    { label: "Failed",    cls: "text-red-400 bg-red-400/10 border-red-400/30",            icon: <XCircle className="w-3 h-3" /> },
  cancelled: { label: "Cancelled", cls: "text-gray-400 bg-gray-400/10 border-gray-400/30",         icon: <X className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: "text-gray-400 bg-gray-800 border-gray-700", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

// ── CSV / paste parser ────────────────────────────────────────────────────────

async function parseFile(file: File): Promise<BulkContact[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row: any) => ({
      phone_number: String(
        row["phone_number"] || row["phone"] || row["Phone"] ||
        row["Phone Number"] || row["mobile"] || row["Mobile"] || ""
      ).trim().replace(/\s/g, ""),
      name: row["name"] || row["Name"] || row["full_name"] || undefined,
      email: row["email"] || row["Email"] || undefined,
    }))
    .filter(c => c.phone_number.length >= 7);
}

function parseTextNumbers(text: string): BulkContact[] {
  return text.split(/[\n,;]+/)
    .map(s => s.trim().replace(/\s/g, ""))
    .filter(s => s.length >= 7)
    .map(phone => ({ phone_number: phone }));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchedulingPage() {
  const [items, setItems] = useState<ScheduledCall[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  // Single schedule modal
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedForm, setSchedForm] = useState({
    agent_id: "", phone_number: "", contact_name: "",
    contact_email: "", scheduled_at: "", notes: "",
  });
  const [schedLoading, setSchedLoading] = useState(false);

  // Bulk schedule modal
  const [showBulk, setShowBulk] = useState(false);
  const [bulkTab, setBulkTab] = useState<"paste" | "file">("paste");
  const [bulkText, setBulkText] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkForm, setBulkForm] = useState({ agent_id: "", scheduled_at: "", notes: "" });
  const [bulkPreview, setBulkPreview] = useState<BulkContact[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const load = async (statusFilter?: string) => {
    try {
      const data = await getScheduledCalls(
        statusFilter && statusFilter !== "all" ? statusFilter : undefined
      );
      setItems(data);
    } catch {
      toast.error("Failed to load scheduled calls");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {});
    load(filter);
  }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const id = setInterval(() => load(filter), 15000);
    return () => clearInterval(id);
  }, [filter]);

  const handleFilterChange = (f: string) => {
    setFilter(f);
    setLoading(true);
    load(f);
  };

  // ── Schedule single call ──
  const handleSchedule = async () => {
    if (!schedForm.agent_id || !schedForm.phone_number || !schedForm.scheduled_at) {
      toast.error("Agent, phone number, and date/time are required");
      return;
    }
    setSchedLoading(true);
    try {
      await scheduleCall({
        agent_id: schedForm.agent_id,
        phone_number: schedForm.phone_number,
        contact_name: schedForm.contact_name || undefined,
        contact_email: schedForm.contact_email || undefined,
        notes: schedForm.notes || undefined,
        scheduled_at: localToUtcIso(schedForm.scheduled_at),
        timezone: IST,
      });
      toast.success("Call scheduled!");
      setShowSchedule(false);
      setSchedForm({ agent_id: "", phone_number: "", contact_name: "", contact_email: "", scheduled_at: "", notes: "" });
      load(filter);
    } catch {
      toast.error("Failed to schedule call");
    } finally {
      setSchedLoading(false);
    }
  };

  // ── Bulk schedule ──
  const handleBulkPreview = async () => {
    if (bulkTab === "paste") {
      setBulkPreview(parseTextNumbers(bulkText));
    } else if (bulkFile) {
      const contacts = await parseFile(bulkFile);
      setBulkPreview(contacts);
    }
  };

  const handleBulkSchedule = async () => {
    if (!bulkForm.agent_id || !bulkForm.scheduled_at || bulkPreview.length === 0) {
      toast.error("Select an agent, date/time, and add contacts");
      return;
    }
    setBulkLoading(true);
    try {
      const res = await bulkScheduleCall({
        agent_id: bulkForm.agent_id,
        scheduled_at: localToUtcIso(bulkForm.scheduled_at),
        timezone: IST,
        notes: bulkForm.notes || undefined,
        contacts: bulkPreview,
      });
      toast.success(`${res.scheduled} calls scheduled!`);
      setShowBulk(false);
      setBulkText("");
      setBulkFile(null);
      setBulkPreview([]);
      setBulkForm({ agent_id: "", scheduled_at: "", notes: "" });
      load(filter);
    } catch {
      toast.error("Failed to schedule bulk calls");
    } finally {
      setBulkLoading(false);
    }
  };

  // ── Cancel ──
  const handleCancel = async (sc: ScheduledCall) => {
    if (!confirm(`Cancel scheduled call to ${sc.phone_number}?`)) return;
    try {
      await cancelScheduledCall(sc.id);
      toast.success("Call cancelled");
      load(filter);
    } catch {
      toast.error("Failed to cancel scheduled call");
    }
  };

  const TABS = [
    { key: "all",       label: "All" },
    { key: "pending",   label: "Pending" },
    { key: "completed", label: "Completed" },
    { key: "failed",    label: "Failed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Call Scheduling</h1>
          <p className="text-gray-400 mt-1">Schedule outbound calls for a future date and time</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-700"
          >
            <Users className="w-4 h-4" /> Bulk Schedule
          </button>
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Schedule Call
          </button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => handleFilterChange(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === t.key
                ? "bg-brand-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">Contact</th>
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-left px-4 py-3">Scheduled (IST)</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Notes</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No scheduled calls
                  </td>
                </tr>
              )}
              {items.map(sc => {
                const agent = agents.find(a => a.id === sc.agent_id);
                return (
                  <tr key={sc.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-white">{sc.phone_number}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {sc.contact_name
                        ? <span className="flex items-center gap-1.5"><User className="w-3 h-3 text-gray-500" />{sc.contact_name}</span>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {agent?.name ?? <span className="text-gray-600 font-mono text-xs">{sc.agent_id.slice(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{fmtScheduled(sc.scheduled_at)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sc.status} />
                      {sc.error_message && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-red-400">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[160px]" title={sc.error_message}>{sc.error_message}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate">
                      {sc.notes ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {sc.call_id && (
                          <a
                            href={`/calls?highlight=${sc.call_id}`}
                            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                          >
                            <ExternalLink className="w-3 h-3" /> View Call
                          </a>
                        )}
                        {sc.status === "pending" && (
                          <button
                            onClick={() => handleCancel(sc)}
                            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Schedule Call Modal ── */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Schedule a Call</h2>
              <button onClick={() => setShowSchedule(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agent *</label>
                <select
                  value={schedForm.agent_id}
                  onChange={e => setSchedForm(f => ({ ...f, agent_id: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="">Select agent…</option>
                  {agents.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  placeholder="+91XXXXXXXXXX"
                  value={schedForm.phone_number}
                  onChange={e => setSchedForm(f => ({ ...f, phone_number: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Schedule Date & Time (IST) *</label>
                <input
                  type="datetime-local"
                  min={nowLocalMin()}
                  value={schedForm.scheduled_at}
                  onChange={e => setSchedForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Contact Name</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={schedForm.contact_name}
                  onChange={e => setSchedForm(f => ({ ...f, contact_name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Contact Email</label>
                <input
                  type="email"
                  placeholder="Optional"
                  value={schedForm.contact_email}
                  onChange={e => setSchedForm(f => ({ ...f, contact_email: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Context for this call…"
                  value={schedForm.notes}
                  onChange={e => setSchedForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowSchedule(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                disabled={schedLoading}
                className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {schedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Schedule Modal ── */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Bulk Schedule</h2>
              <button onClick={() => setShowBulk(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Agent *</label>
                <select
                  value={bulkForm.agent_id}
                  onChange={e => setBulkForm(f => ({ ...f, agent_id: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="">Select agent…</option>
                  {agents.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Date & Time (IST) *</label>
                <input
                  type="datetime-local"
                  min={nowLocalMin()}
                  value={bulkForm.scheduled_at}
                  onChange={e => setBulkForm(f => ({ ...f, scheduled_at: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <input
                type="text"
                placeholder="Optional notes for all calls…"
                value={bulkForm.notes}
                onChange={e => setBulkForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 placeholder-gray-600"
              />
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setBulkTab("paste")}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${bulkTab === "paste" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Paste Numbers
              </button>
              <button
                onClick={() => setBulkTab("file")}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${bulkTab === "file" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Upload CSV / Excel
              </button>
            </div>

            {bulkTab === "paste" ? (
              <div>
                <textarea
                  rows={5}
                  placeholder={"One number per line or comma-separated:\n+917284885875\n+917572900482"}
                  value={bulkText}
                  onChange={e => { setBulkText(e.target.value); setBulkPreview([]); }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-brand-500 placeholder-gray-600 resize-none"
                />
                <button
                  onClick={handleBulkPreview}
                  className="mt-2 text-xs text-brand-400 hover:text-brand-300"
                >
                  Parse numbers
                </button>
              </div>
            ) : (
              <div>
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-700 rounded-lg py-6 cursor-pointer hover:border-brand-500/50 transition-colors">
                  <FileSpreadsheet className="w-6 h-6 text-gray-500" />
                  <span className="text-xs text-gray-400">
                    {bulkFile ? bulkFile.name : "Click to upload CSV or Excel"}
                  </span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={async e => {
                      const f = e.target.files?.[0];
                      if (f) { setBulkFile(f); setBulkPreview([]); }
                    }}
                  />
                </label>
                {bulkFile && (
                  <button
                    onClick={handleBulkPreview}
                    className="mt-2 text-xs text-brand-400 hover:text-brand-300"
                  >
                    Parse file
                  </button>
                )}
              </div>
            )}

            {bulkPreview.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-3 max-h-36 overflow-y-auto">
                <p className="text-xs text-gray-400 mb-2">{bulkPreview.length} contact{bulkPreview.length !== 1 ? "s" : ""} ready</p>
                <div className="space-y-0.5">
                  {bulkPreview.slice(0, 20).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                      <Phone className="w-3 h-3 text-gray-500 shrink-0" />
                      <span className="font-mono">{c.phone_number}</span>
                      {c.name && <span className="text-gray-500">— {c.name}</span>}
                    </div>
                  ))}
                  {bulkPreview.length > 20 && (
                    <div className="text-xs text-gray-500">… and {bulkPreview.length - 20} more</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowBulk(false)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSchedule}
                disabled={bulkLoading || bulkPreview.length === 0}
                className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Schedule {bulkPreview.length > 0 ? `${bulkPreview.length} Calls` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
