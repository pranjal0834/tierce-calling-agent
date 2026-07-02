"use client";
import { useState } from "react";
import {
  Globe, PhoneOff, UserCheck, Calendar, X, Plus, Trash
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addTool, updateTool } from "@/lib/api";
import { getToken } from "@/lib/auth";
import toast from "react-hot-toast";
import { FormField, InputField } from "@/components/ui/FormField";
import { useFocusTrap } from "@/lib/useFocusTrap";

const TOOL_TYPES = [
  {
    value: "webhook",
    label: "Webhook / HTTP",
    icon: Globe,
    color: "text-info-400",
    bg: "bg-info-500/10",
    description: "Call any HTTP endpoint — CRM, calendar, booking system, etc.",
  },
  {
    value: "end_call",
    label: "End Call",
    icon: PhoneOff,
    color: "text-error-400",
    bg: "bg-error-500/10",
    description: "Agent ends the call cleanly after completing its task.",
  },
  {
    value: "transfer_call",
    label: "Transfer to Human",
    icon: UserCheck,
    color: "text-success-400",
    bg: "bg-success-500/10",
    description: "Warm-transfer the caller to a human agent.",
  },
  {
    value: "calendar_booking",
    label: "Book Appointment",
    icon: Calendar,
    color: "text-warning-400",
    bg: "bg-warning-500/10",
    description: "Check real availability and book appointments via Cal.com or Calendly API.",
  },
];

const CALENDAR_INTEGRATIONS = [
  {
    value: "calcom",
    label: "Cal.com",
    oauth: false,
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
    oauth: false,
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
  {
    value: "google_calendar",
    label: "Google Calendar",
    oauth: true,
    apiKeyLabel: "",
    apiKeyPlaceholder: "",
    apiKeyHint: "",
    idLabel: "",
    idKey: "calendar_id",
    idPlaceholder: "",
    idHint: "",
    autoName: "schedule_appointment",
    autoDesc:
      "Check availability and book appointments on Google Calendar. Use action='check_availability' with a date first to see open slots, then action='book' after the caller confirms a time.",
    supportsDirectBooking: true,
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
  parameters: Record<string, any>;
  config: Record<string, any>;
  enabled: boolean;
}

interface ParamDef {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface ToolModalProps {
  agentId: string;
  existing: Tool | null;
  onClose: () => void;
  onSaved: (tool: Tool) => void;
}

const toolSchema = z.object({
  name: z.string().min(1, "Tool name is required"),
  type: z.enum(["webhook", "transfer_call", "calendar_booking", "end_call"]),
  description: z.string().optional().default(""),
  webhookUrl: z.string().optional().default(""),
  transferTo: z.string().optional().default(""),
  calIntegration: z.string().optional().default("calcom"),
  calApiKey: z.string().optional().default(""),
  calEventId: z.string().optional().default(""),
  calTimezone: z.string().optional().default("Asia/Kolkata"),
}).superRefine((data, ctx) => {
  if (data.type === "webhook" && !data.webhookUrl) {
    ctx.addIssue({ code: "custom", path: ["webhookUrl"], message: "Webhook URL is required" });
  }
  if (data.type === "transfer_call" && !data.transferTo) {
    ctx.addIssue({ code: "custom", path: ["transferTo"], message: "Transfer phone number is required" });
  }
  if (data.type === "calendar_booking") {
    const preset = CALENDAR_INTEGRATIONS.find(c => c.value === data.calIntegration);
    if (preset && !preset.oauth) {
      if (!data.calApiKey) {
        ctx.addIssue({ code: "custom", path: ["calApiKey"], message: "API key is required" });
      }
      if (!data.calEventId) {
        ctx.addIssue({ code: "custom", path: ["calEventId"], message: "Event type ID / URI is required" });
      }
    }
  }
});

type ToolFormValues = z.infer<typeof toolSchema>;

export function ToolModal({ agentId, existing, onClose, onSaved }: ToolModalProps) {
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
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const { register, handleSubmit, watch, setValue, getValues, formState: { errors }, trigger } = useForm<ToolFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(toolSchema) as any,
    defaultValues: {
      name: existing?.name ?? "",
      type: (existing?.type as any) ?? "webhook",
      description: existing?.description ?? "",
      webhookUrl: (existing?.config?.url as string) ?? "",
      transferTo: (existing?.config?.transfer_to as string) ?? "",
      calIntegration: (existing?.config?.integration as string) ?? "calcom",
      calApiKey: (existing?.config?.api_key as string) ?? "",
      calEventId: ((existing?.config?.event_type_id ?? existing?.config?.event_type_uri) as string) ?? "",
      calTimezone: (existing?.config?.timezone as string) ?? "Asia/Kolkata",
    },
  });

  const type = watch("type");
  const calIntegration = watch("calIntegration");

  const applyCalPreset = (integrationValue: string) => {
    const preset = CALENDAR_INTEGRATIONS.find(c => c.value === integrationValue);
    if (preset && !existing) {
      const curName = getValues("name");
      const curDesc = getValues("description");
      if (!curName) setValue("name", preset.autoName);
      if (!curDesc) setValue("description", preset.autoDesc);
    }
    setValue("calIntegration", integrationValue);
    setValue("calEventId", "");
  };

  const addParam = () => setParams(p => [...p, { name: "", type: "string", description: "", required: false }]);
  const removeParam = (i: number) => setParams(p => p.filter((_, j) => j !== i));
  const updateParam = (i: number, field: keyof ParamDef, value: string | boolean) =>
    setParams(p => p.map((param, j) => j === i ? { ...param, [field]: value } : param));

  const buildPayload = (data: ToolFormValues) => {
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
    if (data.type === "webhook" && data.webhookUrl) config.url = data.webhookUrl;
    if (data.type === "transfer_call" && data.transferTo) config.transfer_to = data.transferTo;
    if (data.type === "calendar_booking") {
      const preset = CALENDAR_INTEGRATIONS.find(c => c.value === data.calIntegration);
      config.integration = data.calIntegration;
      config.timezone = data.calTimezone;
      if (preset && !preset.oauth) {
        config.api_key = data.calApiKey;
        config[preset.idKey] = data.calEventId;
      } else if (preset && preset.oauth) {
        const ec = (existing?.config ?? {}) as Record<string, string>;
        if (ec.refresh_token) config.refresh_token = ec.refresh_token;
        if (ec.client_id) config.client_id = ec.client_id;
        if (ec.client_secret) config.client_secret = ec.client_secret;
        config.calendar_id = ec.calendar_id || "primary";
      }
    }

    return { name: data.name, type: data.type, description: data.description, parameters, config, enabled: true };
  };

  const onSave = handleSubmit(async (data: ToolFormValues) => {
    setSaving(true);
    try {
      const payload = buildPayload(data);
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
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="tool-modal-title">
      <div ref={dialogRef} className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-lg w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-neutral-200">
          <h2 id="tool-modal-title" className="text-lg font-semibold text-neutral-900">
            {existing ? "Edit Tool" : "Add Tool"}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">
            <X className="icon-lg" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Tool type */}
          <div>
            <label className="text-xs text-neutral-500 uppercase tracking-wide mb-2 block">Tool Type</label>
            <div className="grid grid-cols-2 gap-2">
              {TOOL_TYPES.map(tt => (
                <button
                  key={tt.value}
                  type="button"
                  onClick={() => setValue("type", tt.value as any)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all ${
                    type === tt.value
                      ? "border-brand-500 bg-brand-50"
                      : "border-neutral-200 bg-neutral-50 hover:border-neutral-300"
                  }`}
                >
                  <tt.icon className={`icon-lg ${type === tt.value ? "text-brand-600" : tt.color}`} />
                  <span className="text-xs font-medium text-neutral-700 leading-tight">{tt.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              {TOOL_TYPES.find(t => t.value === type)?.description}
            </p>
          </div>

          {/* Name */}
          <InputField
            label="Function Name"
            id="tool-name"
            required
            registration={register("name", { setValueAs: (v: string) => v.replace(/\s+/g, "_").toLowerCase() })}
            error={errors.name}
            placeholder="check_availability"
            hint="Lowercase, underscores only. This is what the AI calls."
          />

          {/* Description */}
          <InputField
            label="Description"
            id="tool-description"
            registration={register("description")}
            error={errors.description}
            placeholder="Check available time slots in the calendar"
            rows={2}
            hint="Describe when the AI should call this tool."
          />

          {/* Webhook URL */}
          {type === "webhook" && (
            <InputField
              label="Webhook URL"
              id="webhook-url"
              required
              registration={register("webhookUrl")}
              error={errors.webhookUrl}
              placeholder="https://your-api.com/webhook"
              hint="POST request with JSON body of collected parameters."
            />
          )}

          {/* Transfer number */}
          {type === "transfer_call" && (
            <InputField
              label="Transfer To (E.164)"
              id="transfer-to"
              required
              type="tel"
              registration={register("transferTo")}
              error={errors.transferTo}
              placeholder="+14155552671"
            />
          )}

          {/* Calendar Booking Config */}
          {type === "calendar_booking" && (
            <div className="space-y-4">
              {/* Integration picker */}
              <div>
                <label className="text-xs text-neutral-500 uppercase tracking-wide mb-2 block">Calendar Platform</label>
                <div className="grid grid-cols-2 gap-2">
                  {CALENDAR_INTEGRATIONS.map(ci => (
                    <button
                      key={ci.value}
                      type="button"
                      onClick={() => applyCalPreset(ci.value)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        calIntegration === ci.value
                          ? "border-brand-500 bg-brand-50"
                          : "border-neutral-200 bg-neutral-50 hover:border-neutral-300"
                      }`}
                    >
                      <span className="text-xl">{ci.value === "calcom" ? "🗓" : ci.value === "google_calendar" ? "📆" : "📅"}</span>
                      <div>
                        <p className="text-xs font-semibold text-neutral-800">{ci.label}</p>
                        <p className="text-xs text-neutral-500">{ci.supportsDirectBooking ? "Direct booking" : "Link booking"}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1.5">
                  {calIntegration === "calcom"
                    ? "Checks real availability and books appointments directly via the Cal.com API."
                    : calIntegration === "google_calendar"
                    ? "Checks availability and books directly on your Google Calendar. Connect your Google account below — no API key or caller email needed."
                    : "Checks availability. For booking, sends the caller a personal one-time Calendly link."}
                </p>
              </div>

              {/* OAuth connect (Google) — no API key needed */}
              {CALENDAR_INTEGRATIONS.find(c => c.value === calIntegration)?.oauth && (
                <div className="bg-info-50 border border-info-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-info-700">Connect your Google account</p>
                  <p className="text-xs text-neutral-600">
                    Save this tool first, then authorize Google Calendar. Appointments are booked on your
                    primary calendar — no caller email required.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!agentId) { toast.error("Save the agent first, then connect."); return; }
                      const tk = getToken();
                      const base = process.env.NEXT_PUBLIC_API_URL || "";
                      window.open(`${base}/auth/google/calendar/connect?agent_id=${agentId}&token=${tk}`, "_blank");
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:border-brand-500 transition-colors"
                  >
                    📆 Connect Google Calendar
                  </button>
                </div>
              )}

              {/* API Key + Event ID (non-OAuth providers) */}
              {(() => {
                const preset = CALENDAR_INTEGRATIONS.find(c => c.value === calIntegration);
                if (!preset || preset.oauth) return null;
                return (
                  <>
                    <InputField
                      label={preset.apiKeyLabel}
                      id="cal-api-key"
                      required
                      registration={register("calApiKey")}
                      error={errors.calApiKey}
                      placeholder={preset.apiKeyPlaceholder}
                      hint={preset.apiKeyHint}
                      type="password"
                    />
                    <InputField
                      label={preset.idLabel}
                      id="cal-event-id"
                      required
                      registration={register("calEventId")}
                      error={errors.calEventId}
                      placeholder={preset.idPlaceholder}
                      hint={preset.idHint}
                    />
                  </>
                );
              })()}

              {/* Timezone */}
              <FormField label="Booking Timezone" error={errors.calTimezone}>
                <select {...register("calTimezone")} className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-brand-500">
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </FormField>

              {/* How it works */}
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-semibold text-warning-700 mb-1.5">How the agent uses this tool</p>
                <p className="text-xs text-neutral-600">1. Caller says they want to book an appointment</p>
                <p className="text-xs text-neutral-600">2. Agent asks for preferred date → calls <span className="font-mono text-warning-600">check_availability</span></p>
                <p className="text-xs text-neutral-600">3. Agent reads available slots, caller picks one</p>
                <p className="text-xs text-neutral-600">4. Agent collects name + email → calls <span className="font-mono text-warning-600">book</span></p>
                <p className="text-xs text-neutral-600">5. Confirmation sent to caller's email automatically</p>
              </div>
            </div>
          )}

          {/* Parameters (webhook only) */}
          {type === "webhook" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-neutral-500 uppercase tracking-wide">Parameters</label>
                <button
                  onClick={addParam}
                  className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600"
                >
                  <Plus className="icon-xs" /> Add
                </button>
              </div>
              {params.length === 0 ? (
                <p className="text-xs text-neutral-400 italic">No parameters — the webhook will be called with no body.</p>
              ) : (
                <div className="space-y-2">
                  {params.map((p, i) => (
                    <div key={i} className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={p.name}
                          onChange={e => updateParam(i, "name", e.target.value)}
                          placeholder="param_name"
                          className="flex-1 bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none font-mono"
                        />
                        <select
                          value={p.type}
                          onChange={e => updateParam(i, "type", e.target.value)}
                          className="bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-900 focus:outline-none"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                        </select>
                        <button onClick={() => removeParam(i)} className="text-neutral-400 hover:text-error-500">
                          <Trash className="icon-xs" />
                        </button>
                      </div>
                      <input
                        value={p.description}
                        onChange={e => updateParam(i, "description", e.target.value)}
                        placeholder="Describe this parameter..."
                        className="w-full bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none"
                      />
                      <label htmlFor={`param-required-${i}`} className="flex items-center gap-2 cursor-pointer">
                        <input
                          id={`param-required-${i}`}
                          type="checkbox"
                          checked={p.required}
                          onChange={e => updateParam(i, "required", e.target.checked)}
                          className="accent-brand-500"
                        />
                        <span className="text-xs text-neutral-500">Required</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-neutral-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900">
            Cancel
          </button>
          <button
            onClick={onSave}
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
