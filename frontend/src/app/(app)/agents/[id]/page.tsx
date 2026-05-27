"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, Layers, Pencil, Trash2, Phone,
  CheckCircle2, XCircle, Clock, TrendingUp,
  Smile, Brain, Mic2, Network, Wrench, Globe, PhoneOff,
  UserCheck, Plus, Trash, ToggleLeft, ToggleRight, AlertCircle, X, Calendar,
} from "lucide-react";
import Link from "next/link";
import {
  getAgent, getCalls, getAgentAnalytics, deleteAgent,
  getTools, addTool, updateTool, deleteTool,
} from "@/lib/api";
import toast from "react-hot-toast";

const VOICE_LABELS: Record<string, string> = {
  alloy: "Alloy", ash: "Ash", ballad: "Ballad", coral: "Coral",
  echo: "Echo", sage: "Sage", shimmer: "Shimmer", verse: "Verse",
};

const TOOL_TYPES = [
  {
    value: "webhook",
    label: "Webhook / HTTP",
    icon: Globe,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    description: "Call any HTTP endpoint — CRM, calendar, booking system, etc.",
  },
  {
    value: "end_call",
    label: "End Call",
    icon: PhoneOff,
    color: "text-red-400",
    bg: "bg-red-500/10",
    description: "Agent ends the call cleanly after completing its task.",
  },
  {
    value: "transfer_call",
    label: "Transfer to Human",
    icon: UserCheck,
    color: "text-green-400",
    bg: "bg-green-500/10",
    description: "Warm-transfer the caller to a human agent.",
  },
  {
    value: "calendar_booking",
    label: "Book Appointment",
    icon: Calendar,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    description: "Check real availability and book appointments via Cal.com or Calendly API.",
  },
];

const CALENDAR_INTEGRATIONS = [
  {
    value: "calcom",
    label: "Cal.com",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "cal_live_xxxxxxxxxxxxxxxxxxxx",
    apiKeyHint: "app.cal.com → Settings → Developer → API Keys",
    idLabel: "Event Type ID",
    idKey: "event_type_id",
    idPlaceholder: "123456",
    idHint: "From your event type URL: app.cal.com/event-types/123456",
    autoName: "schedule_appointment",
    autoDesc:
      "Check available slots and book appointments on Cal.com. Use action='check_availability' with a date first to see open slots, then action='book' after confirming the caller's name, email, and preferred time.",
    supportsDirectBooking: true,
  },
  {
    value: "calendly",
    label: "Calendly",
    apiKeyLabel: "Personal Access Token",
    apiKeyPlaceholder: "eyJraWQiOiIxMjM0NTY3ODk...",
    apiKeyHint: "calendly.com → Integrations → API & Webhooks → Personal Access Token",
    idLabel: "Event Type URI",
    idKey: "event_type_uri",
    idPlaceholder: "https://api.calendly.com/event_types/XXXXXXXXXXXXXXXX",
    idHint: "Call GET https://api.calendly.com/event_types with your token to find the URI",
    autoName: "schedule_appointment",
    autoDesc:
      "Check available Calendly slots. Use action='check_availability' with a date to see open times. After the caller confirms a slot, use action='book' to send them a personal one-time scheduling link.",
    supportsDirectBooking: false,
  },
];

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "Australia/Sydney", "UTC",
];

interface Tool {
  id: string;
  name: string;
  type: string;
  description: string;
  parameters: Record<string, unknown>;
  config: Record<string, unknown>;
  enabled: boolean;
}

interface ParamDef {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed:     { label: "Completed",    cls: "bg-green-500/10 text-green-400" },
    "in-progress": { label: "Live",         cls: "bg-blue-500/10 text-blue-400 animate-pulse" },
    in_progress:   { label: "Live",         cls: "bg-blue-500/10 text-blue-400 animate-pulse" },
    ringing:       { label: "Ringing",      cls: "bg-yellow-500/10 text-yellow-400 animate-pulse" },
    initiated:     { label: "Initiated",    cls: "bg-yellow-500/10 text-yellow-400" },
    not_answered:  { label: "Not Answered", cls: "bg-gray-500/10 text-gray-400" },
    failed:        { label: "Failed",       cls: "bg-red-500/10 text-red-400" },
    cancelled:     { label: "Cancelled",    cls: "bg-gray-500/10 text-gray-400" },
    voicemail:     { label: "Voicemail",    cls: "bg-orange-500/10 text-orange-400" },
  };
  const b = map[status] ?? { label: status, cls: "bg-gray-500/10 text-gray-400" };
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${b.cls}`}>{b.label}</span>;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      {children}
    </div>
  );
}

// ── Tool Form Modal ─────────────────────────────────────────────────────────

function ToolModal({
  agentId,
  existing,
  onClose,
  onSaved,
}: {
  agentId: string;
  existing: Tool | null;
  onClose: () => void;
  onSaved: (tool: Tool) => void;
}) {
  const [type, setType] = useState(existing?.type ?? "webhook");
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [webhookUrl, setWebhookUrl] = useState((existing?.config?.url as string) ?? "");
  const [transferTo, setTransferTo] = useState((existing?.config?.transfer_to as string) ?? "");
  const [calIntegration, setCalIntegration] = useState((existing?.config?.integration as string) ?? "calcom");
  const [calApiKey, setCalApiKey] = useState((existing?.config?.api_key as string) ?? "");
  const [calEventId, setCalEventId] = useState(
    ((existing?.config?.event_type_id ?? existing?.config?.event_type_uri) as string) ?? ""
  );
  const [calTimezone, setCalTimezone] = useState((existing?.config?.timezone as string) ?? "Asia/Kolkata");
  const [params, setParams] = useState<ParamDef[]>(
    existing?.parameters?.properties
      ? Object.entries(existing.parameters.properties as Record<string, {type: string; description: string}>).map(([k, v]) => ({
          name: k,
          type: v.type ?? "string",
          description: v.description ?? "",
          required: ((existing.parameters.required as string[]) ?? []).includes(k),
        }))
      : []
  );
  const [saving, setSaving] = useState(false);

  const applyCalPreset = (integrationValue: string) => {
    const preset = CALENDAR_INTEGRATIONS.find(c => c.value === integrationValue);
    if (preset && !existing) {
      if (!name) setName(preset.autoName);
      if (!description) setDescription(preset.autoDesc);
    }
    setCalIntegration(integrationValue);
    setCalEventId("");
  };

  const addParam = () => setParams(p => [...p, { name: "", type: "string", description: "", required: false }]);
  const removeParam = (i: number) => setParams(p => p.filter((_, j) => j !== i));
  const updateParam = (i: number, field: keyof ParamDef, value: string | boolean) =>
    setParams(p => p.map((param, j) => j === i ? { ...param, [field]: value } : param));

  const buildPayload = () => {
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];
    for (const p of params) {
      if (!p.name) continue;
      properties[p.name] = { type: p.type, description: p.description };
      if (p.required) required.push(p.name);
    }
    const parameters = params.length > 0
      ? { type: "object", properties, required }
      : {};

    const config: Record<string, string> = {};
    if (type === "webhook" && webhookUrl) config.url = webhookUrl;
    if (type === "transfer_call" && transferTo) config.transfer_to = transferTo;
    if (type === "calendar_booking") {
      const preset = CALENDAR_INTEGRATIONS.find(c => c.value === calIntegration);
      config.integration = calIntegration;
      config.api_key = calApiKey;
      config.timezone = calTimezone;
      if (preset) config[preset.idKey] = calEventId;
    }

    return { name, type, description, parameters, config, enabled: true };
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Tool name is required"); return; }
    if (type === "webhook" && !webhookUrl.trim()) { toast.error("Webhook URL is required"); return; }
    if (type === "transfer_call" && !transferTo.trim()) { toast.error("Transfer phone number is required"); return; }
    if (type === "calendar_booking" && !calApiKey.trim()) { toast.error("API key is required"); return; }
    if (type === "calendar_booking" && !calEventId.trim()) { toast.error("Event type ID / URI is required"); return; }

    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = existing
        ? await updateTool(agentId, existing.id, payload)
        : await addTool(agentId, payload);
      toast.success(existing ? "Tool updated" : "Tool added");
      onSaved(saved);
    } catch {
      toast.error("Failed to save tool");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            {existing ? "Edit Tool" : "Add Tool"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Tool type */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">Tool Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TOOL_TYPES.map(tt => (
                <button
                  key={tt.value}
                  onClick={() => setType(tt.value)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${
                    type === tt.value
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-gray-700 bg-gray-800 hover:border-gray-600"
                  }`}
                >
                  <tt.icon className={`w-5 h-5 ${type === tt.value ? "text-brand-400" : tt.color}`} />
                  <span className="text-xs font-medium text-gray-200 leading-tight">{tt.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {TOOL_TYPES.find(t => t.value === type)?.description}
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">
              Function Name <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value.replace(/\s+/g, "_").toLowerCase())}
              placeholder="check_availability"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase, underscores only. This is what the AI calls.</p>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Check available time slots in the calendar"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">Describe when the AI should call this tool.</p>
          </div>

          {/* Webhook URL */}
          {type === "webhook" && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">
                Webhook URL <span className="text-red-400">*</span>
              </label>
              <input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://your-api.com/webhook"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">POST request with JSON body of collected parameters.</p>
            </div>
          )}

          {/* Transfer number */}
          {type === "transfer_call" && (
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">
                Transfer To (E.164) <span className="text-red-400">*</span>
              </label>
              <input
                value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
                placeholder="+14155552671"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
          )}

          {/* Calendar Booking Config */}
          {type === "calendar_booking" && (
            <div className="space-y-4">
              {/* Integration picker */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">Calendar Platform</label>
                <div className="grid grid-cols-2 gap-2">
                  {CALENDAR_INTEGRATIONS.map(ci => (
                    <button
                      key={ci.value}
                      type="button"
                      onClick={() => applyCalPreset(ci.value)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        calIntegration === ci.value
                          ? "border-brand-500 bg-brand-500/10"
                          : "border-gray-700 bg-gray-800 hover:border-gray-600"
                      }`}
                    >
                      <span className="text-xl">{ci.value === "calcom" ? "🗓" : "📅"}</span>
                      <div>
                        <p className="text-xs font-semibold text-gray-200">{ci.label}</p>
                        <p className="text-xs text-gray-500">{ci.supportsDirectBooking ? "Direct booking" : "Link booking"}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {calIntegration === "calcom"
                    ? "Checks real availability and books appointments directly via the Cal.com API."
                    : "Checks availability. For booking, sends the caller a personal one-time Calendly link."}
                </p>
              </div>

              {/* API Key + Event ID */}
              {(() => {
                const preset = CALENDAR_INTEGRATIONS.find(c => c.value === calIntegration);
                if (!preset) return null;
                return (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">
                        {preset.apiKeyLabel} <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="password"
                        value={calApiKey}
                        onChange={e => setCalApiKey(e.target.value)}
                        placeholder={preset.apiKeyPlaceholder}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                      />
                      <p className="text-xs text-gray-500 mt-1">{preset.apiKeyHint}</p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">
                        {preset.idLabel} <span className="text-red-400">*</span>
                      </label>
                      <input
                        value={calEventId}
                        onChange={e => setCalEventId(e.target.value)}
                        placeholder={preset.idPlaceholder}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                      />
                      <p className="text-xs text-gray-500 mt-1">{preset.idHint}</p>
                    </div>
                  </>
                );
              })()}

              {/* Timezone */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide mb-1.5 block">Booking Timezone</label>
                <select
                  value={calTimezone}
                  onChange={e => setCalTimezone(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              {/* How it works */}
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-orange-300 mb-1.5">How the agent uses this tool</p>
                <p className="text-xs text-gray-400">1. Caller says they want to book an appointment</p>
                <p className="text-xs text-gray-400">2. Agent asks for preferred date → calls <span className="font-mono text-orange-300">check_availability</span></p>
                <p className="text-xs text-gray-400">3. Agent reads available slots, caller picks one</p>
                <p className="text-xs text-gray-400">4. Agent collects name + email → calls <span className="font-mono text-orange-300">book</span></p>
                <p className="text-xs text-gray-400">5. Confirmation sent to caller&apos;s email automatically</p>
              </div>
            </div>
          )}

          {/* Parameters (webhook only) */}
          {type === "webhook" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400 uppercase tracking-wide">Parameters</label>
                <button
                  onClick={addParam}
                  className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              {params.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No parameters — the webhook will be called with no body.</p>
              ) : (
                <div className="space-y-2">
                  {params.map((p, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={p.name}
                          onChange={e => updateParam(i, "name", e.target.value)}
                          placeholder="param_name"
                          className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none font-mono"
                        />
                        <select
                          value={p.type}
                          onChange={e => updateParam(i, "type", e.target.value)}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                        </select>
                        <button onClick={() => removeParam(i)} className="text-gray-500 hover:text-red-400">
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        value={p.description}
                        onChange={e => updateParam(i, "description", e.target.value)}
                        placeholder="Describe this parameter..."
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none"
                      />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.required}
                          onChange={e => updateParam(i, "required", e.target.checked)}
                          className="accent-brand-500"
                        />
                        <span className="text-xs text-gray-400">Required</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : existing ? "Save Changes" : "Add Tool"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tools Tab ───────────────────────────────────────────────────────────────

function ToolsTab({ agentId }: { agentId: string }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);

  useEffect(() => {
    getTools(agentId)
      .then(setTools)
      .catch(() => toast.error("Failed to load tools"))
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleSaved = (tool: Tool) => {
    setTools(prev => {
      const idx = prev.findIndex(t => t.id === tool.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = tool;
        return next;
      }
      return [...prev, tool];
    });
    setShowModal(false);
    setEditing(null);
  };

  const handleToggle = async (tool: Tool) => {
    try {
      const updated = await updateTool(agentId, tool.id, { enabled: !tool.enabled });
      setTools(prev => prev.map(t => t.id === tool.id ? updated : t));
    } catch {
      toast.error("Failed to toggle tool");
    }
  };

  const handleDelete = async (tool: Tool) => {
    if (!confirm(`Delete tool "${tool.name}"?`)) return;
    try {
      await deleteTool(agentId, tool.id);
      setTools(prev => prev.filter(t => t.id !== tool.id));
      toast.success("Tool deleted");
    } catch {
      toast.error("Failed to delete tool");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Function Tools</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Tools the AI can call during a live conversation to take actions.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Tool
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-300">
          Tools are passed to the AI as callable functions. The agent decides when to call them based on the conversation context and tool descriptions.
        </p>
      </div>

      {/* Tool type legend */}
      <div className="grid grid-cols-3 gap-3">
        {TOOL_TYPES.map(tt => (
          <div key={tt.value} className={`rounded-xl p-3 border border-gray-800 ${tt.bg}/20 flex items-start gap-2.5`}>
            <div className={`w-7 h-7 rounded-lg ${tt.bg} flex items-center justify-center flex-shrink-0`}>
              <tt.icon className={`w-4 h-4 ${tt.color}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-200">{tt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{tt.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tools list */}
      {tools.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800 border-dashed">
          <Wrench className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No tools configured yet</p>
          <p className="text-xs text-gray-500 mt-1">Add a webhook, end-call, or transfer tool to get started</p>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" /> Add First Tool
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map(tool => {
            const meta = TOOL_TYPES.find(t => t.value === tool.type);
            const Icon = meta?.icon ?? Wrench;
            const paramCount = Object.keys((tool.parameters as {properties?: object})?.properties ?? {}).length;
            return (
              <div
                key={tool.id}
                className={`bg-gray-900 border rounded-xl p-4 transition-all ${
                  tool.enabled ? "border-gray-700" : "border-gray-800 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${meta?.bg ?? "bg-gray-800"} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${meta?.color ?? "text-gray-400"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-medium text-white">{tool.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${meta?.bg ?? "bg-gray-800"} ${meta?.color ?? "text-gray-400"}`}>
                          {meta?.label ?? tool.type}
                        </span>
                        {!tool.enabled && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">disabled</span>
                        )}
                      </div>
                      {tool.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{tool.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {tool.type === "webhook" && !!tool.config?.url && (
                          <span className="text-xs text-gray-500 font-mono truncate max-w-xs">
                            {String(tool.config.url)}
                          </span>
                        )}
                        {tool.type === "transfer_call" && !!tool.config?.transfer_to && (
                          <span className="text-xs text-gray-500 font-mono">
                            → {String(tool.config.transfer_to)}
                          </span>
                        )}
                        {tool.type === "calendar_booking" && !!tool.config?.integration && (
                          <span className="text-xs text-gray-500">
                            via {String(tool.config.integration) === "calcom" ? "Cal.com" : "Calendly"}
                            {tool.config.timezone ? ` · ${String(tool.config.timezone)}` : ""}
                          </span>
                        )}
                        {paramCount > 0 && (
                          <span className="text-xs text-gray-600">{paramCount} param{paramCount !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(tool)}
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      title={tool.enabled ? "Disable" : "Enable"}
                    >
                      {tool.enabled
                        ? <ToggleRight className="w-5 h-5 text-green-400" />
                        : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => { setEditing(tool); setShowModal(true); }}
                      className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tool)}
                      className="text-gray-500 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ToolModal
          agentId={agentId}
          existing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AgentViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<any>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "tools">("overview");

  useEffect(() => {
    Promise.all([
      getAgent(id),
      getCalls(id),
      getAgentAnalytics(id),
    ]).then(([a, c, an]) => {
      setAgent(a);
      setCalls(c.slice(0, 10));
      setAnalytics(an);
    }).catch(() => toast.error("Failed to load agent")).finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    try {
      await deleteAgent(id);
      toast.success("Agent deleted");
      router.push("/agents");
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-24 text-gray-400">
        Agent not found.{" "}
        <Link href="/agents" className="text-brand-400 hover:underline">Back to agents</Link>
      </div>
    );
  }

  const completedCalls = calls.filter(c => c.status === "completed").length;
  const avgDuration = calls.length
    ? Math.round(calls.filter(c => c.duration_seconds).reduce((s, c) => s + (c.duration_seconds || 0), 0) / Math.max(calls.filter(c => c.duration_seconds).length, 1))
    : 0;

  const features = [
    { key: "backchannel_enabled", label: "Backchannel Engine", icon: Mic2, color: "text-green-400" },
    { key: "emotional_intelligence", label: "Emotional Intelligence", icon: Smile, color: "text-pink-400" },
    { key: "predictive_engine", label: "Predictive Engine", icon: TrendingUp, color: "text-orange-400" },
    { key: "memory_graph", label: "Memory Graph", icon: Network, color: "text-blue-400" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/agents" className="mt-1 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                agent.pipeline_mode === "native" ? "bg-purple-500/20" : "bg-blue-500/20"
              }`}>
                {agent.pipeline_mode === "native"
                  ? <Zap className="w-5 h-5 text-purple-400" />
                  : <Layers className="w-5 h-5 text-blue-400" />}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
                {agent.description && <p className="text-sm text-gray-400">{agent.description}</p>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/agents?edit=${id}`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Calls" value={analytics?.total_calls ?? calls.length} />
        <Stat label="Completed" value={analytics?.completed_calls ?? completedCalls} />
        <Stat
          label="Avg Duration"
          value={`${analytics?.avg_duration_seconds ? Math.round(analytics.avg_duration_seconds) : avgDuration}s`}
          sub={analytics?.avg_duration_seconds ? `${Math.round(analytics.avg_duration_seconds / 60)}m avg` : undefined}
        />
        <Stat
          label="Sentiment"
          value={analytics?.avg_sentiment_score != null ? `${(analytics.avg_sentiment_score * 100).toFixed(0)}%` : "—"}
          sub="avg positivity"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-800">
        {(["overview", "tools"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-brand-500 text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "overview" ? <Layers className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
            {tab === "overview" ? "Overview" : "Tools"}
            {tab === "tools" && agent?.config?.tools?.length > 0 && (
              <span className="text-xs bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full">
                {agent.config.tools.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid md:grid-cols-3 gap-4">
          {/* Left: Configuration */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Configuration</h2>
              <Row label="Pipeline">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  agent.pipeline_mode === "native" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                }`}>
                  {agent.pipeline_mode === "native" ? "Native Audio" : "Classic Pipeline"}
                </span>
              </Row>
              <Row label="Model">
                <span className="text-sm text-white font-mono">{agent.llm_model}</span>
              </Row>
              <Row label="Voice">
                <span className="text-sm text-white">{VOICE_LABELS[agent.voice_id] ?? agent.voice_id ?? "—"}</span>
              </Row>
              <Row label="Status">
                {agent.is_active
                  ? <span className="flex items-center gap-1 text-sm text-green-400"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                  : <span className="flex items-center gap-1 text-sm text-gray-400"><XCircle className="w-3.5 h-3.5" /> Inactive</span>}
              </Row>
              <Row label="Accent">
                <span className="text-sm text-white">{agent.config?.accent || "Default (Neutral)"}</span>
              </Row>
              <Row label="Speech Pace">
                <span className="text-sm text-white capitalize">{agent.config?.speech_pace || "Natural"}</span>
              </Row>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Languages</h2>
              {agent.config?.languages?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {agent.config.languages.map((lang: string, i: number) => (
                    <span
                      key={lang}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        i === 0
                          ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
                          : "bg-gray-800 text-gray-300 border border-gray-700"
                      }`}
                    >
                      {lang}{i === 0 && agent.config.languages.length > 1 ? " (primary)" : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-400">English (default)</span>
              )}
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Features</h2>
              {features.map(({ key, label, icon: Icon, color }) => {
                const enabled = agent.config?.[key];
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${enabled ? color : "text-gray-600"}`} />
                      <span className={`text-sm ${enabled ? "text-gray-200" : "text-gray-500"}`}>{label}</span>
                    </div>
                    <span className={`text-xs font-medium ${enabled ? "text-green-400" : "text-gray-600"}`}>
                      {enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: System Prompt + Recent Calls */}
          <div className="md:col-span-2 space-y-4">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">System Prompt</h2>
              </div>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                {agent.system_prompt}
              </pre>
            </div>

            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-brand-400" />
                  <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Recent Calls</h2>
                </div>
                <Link href={`/calls?agent=${id}`} className="text-xs text-brand-400 hover:text-brand-300">
                  View all →
                </Link>
              </div>
              {calls.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No calls yet for this agent.</div>
              ) : (
                <div className="space-y-2">
                  {calls.map((call: any) => (
                    <div key={call.id} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          call.direction === "outbound" ? "bg-brand-500/15" : "bg-green-500/15"
                        }`}>
                          <Phone className={`w-3.5 h-3.5 ${call.direction === "outbound" ? "text-brand-400" : "text-green-400"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white font-mono truncate">{call.phone_number}</p>
                          <p className="text-xs text-gray-500">
                            {new Date((call.created_at.endsWith("Z") || call.created_at.includes("+") ? call.created_at : call.created_at + "Z")).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {call.duration_seconds != null && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                          </span>
                        )}
                        <StatusBadge status={call.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "tools" && <ToolsTab agentId={id} />}
    </div>
  );
}
