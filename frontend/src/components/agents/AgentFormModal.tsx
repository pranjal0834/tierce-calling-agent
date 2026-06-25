"use client";
import { useEffect, useState } from "react";
import { Lock, X, BookOpen, User, FileText, AudioLines, MessageCircle } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import { createAgent, updateAgent, getKnowledgeBases } from "@/lib/api";
import { VoicePicker } from "./VoicePicker";
import { LanguagePicker } from "./LanguagePicker";

const DEFAULT_FORM = {
  name: "",
  description: "",
  system_prompt: "You are a helpful sales agent calling leads. Be friendly and professional.",
  pipeline_mode: "native",
  llm_model: "Tierce Voice Engine",
  voice_id: "Aoede",
  is_personal: false,
  config: {
    backchannel_enabled: true,
    emotional_intelligence: true,
    predictive_engine: true,
    memory_graph: true,
    accent: "",
    speech_pace: "natural",
    languages: ["English"] as string[],
    knowledge_base_ids: [] as string[],
    variables: [] as { name: string; value: string }[],
    whatsapp_enabled: false,
    whatsapp_message: "",
  },
};

// Starter WhatsApp messages the user can pick and then edit. [Customer Name] etc. are
// filled in per call. "Custom" = start blank.
const WHATSAPP_TEMPLATES: { label: string; text: string }[] = [
  { label: "Custom (write your own)", text: "" },
  { label: "Thank you / business info", text: "Hi [Customer Name]! Thanks for speaking with us. Here are our details — feel free to reach out anytime. 🙏" },
  { label: "Appointment confirmation", text: "Hi [Customer Name], your appointment is confirmed. We look forward to seeing you. Reply here if you need to reschedule." },
  { label: "Follow-up / callback", text: "Hi [Customer Name], thanks for your time on the call. We'll follow up as discussed. Let us know if you have any questions." },
];

interface AgentFormModalProps {
  editingAgent: any | null;
  onClose: () => void;
  onSaved: (agent: any, isEdit: boolean) => void;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="label-base">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const TABS = [
  { id: "basics", label: "Basics", icon: User },
  { id: "prompt", label: "Prompt", icon: FileText },
  { id: "voice", label: "Voice & Speech", icon: AudioLines },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "followup", label: "Follow-up", icon: MessageCircle },
] as const;

export function AgentFormModal({ editingAgent, onClose, onSaved }: AgentFormModalProps) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("basics");

  useEffect(() => {
    getKnowledgeBases().then(setKnowledgeBases).catch(() => {});
  }, []);

  useEffect(() => {
    if (editingAgent) {
      setForm({
        name: editingAgent.name,
        description: editingAgent.description || "",
        system_prompt: editingAgent.system_prompt,
        pipeline_mode: editingAgent.pipeline_mode,
        llm_model: editingAgent.llm_model,
        voice_id: editingAgent.voice_id || "Aoede",
        is_personal: editingAgent.is_personal ?? false,
        config: {
          // Preserve any existing config keys (e.g. tools) on edit
          ...(editingAgent.config || {}),
          backchannel_enabled: editingAgent.config?.backchannel_enabled ?? true,
          emotional_intelligence: editingAgent.config?.emotional_intelligence ?? true,
          predictive_engine: editingAgent.config?.predictive_engine ?? true,
          memory_graph: editingAgent.config?.memory_graph ?? true,
          accent: editingAgent.config?.accent ?? "",
          speech_pace: editingAgent.config?.speech_pace ?? "natural",
          languages: editingAgent.config?.languages ?? ["English"],
          knowledge_base_ids: editingAgent.config?.knowledge_base_ids ?? [],
          variables: editingAgent.config?.variables ?? [],
          whatsapp_enabled: editingAgent.config?.whatsapp_enabled ?? false,
          whatsapp_message: editingAgent.config?.whatsapp_message ?? "",
        },
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setTab("basics");
  }, [editingAgent]);

  const variables: { name: string; value: string }[] = (form.config as any).variables ?? [];
  const setVariables = (next: { name: string; value: string }[]) =>
    setForm(f => ({ ...f, config: { ...f.config, variables: next } }));
  const addVariable = () => setVariables([...variables, { name: "", value: "" }]);
  const updateVariable = (i: number, key: "name" | "value", val: string) =>
    setVariables(variables.map((v, idx) => (idx === i ? { ...v, [key]: val } : v)));
  const removeVariable = (i: number) => setVariables(variables.filter((_, idx) => idx !== i));

  const selectedKbs: string[] = (form.config as any).knowledge_base_ids ?? [];
  const toggleKb = (id: string) => {
    setForm(f => {
      const cur: string[] = (f.config as any).knowledge_base_ids ?? [];
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      return { ...f, config: { ...f.config, knowledge_base_ids: next } };
    });
  };

  const handleSave = async () => {
    if (!form.name) {
      setTab("basics");
      toast.error("Name is required");
      return;
    }
    if (!form.system_prompt) {
      setTab("prompt");
      toast.error("System prompt is required");
      return;
    }
    setLoading(true);
    try {
      if (editingAgent) {
        const updated = await updateAgent(editingAgent.id, form);
        toast.success("Agent updated!");
        onSaved(updated, true);
      } else {
        const created = await createAgent(form);
        toast.success("Agent created!");
        onSaved(created, false);
      }
      onClose();
    } catch {
      toast.error(editingAgent ? "Failed to update agent" : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-modal w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-[15px] font-semibold text-neutral-900">
            {editingAgent ? "Edit Agent" : "Create Agent"}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabbed body: vertical rail (desktop) / horizontal strip (mobile) + content */}
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Tab rail */}
          <nav className="flex sm:flex-col gap-1 px-3 py-3 sm:w-48 sm:flex-shrink-0 border-b sm:border-b-0 sm:border-r border-neutral-100 overflow-x-auto scroll-thin">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-brand-500" : "text-neutral-400"}`} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div className="p-6 space-y-4 overflow-y-auto scroll-thin flex-1 min-h-0">
            {/* ── Basics ─────────────────────────────────────────────── */}
            {tab === "basics" && (
              <div className="space-y-4">
                <Field label="Name" required>
                  <input
                    className="input-base"
                    placeholder="e.g. Sales Agent"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </Field>

                <Field label="Description">
                  <input
                    className="input-base"
                    placeholder="Optional description"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </Field>

                {!editingAgent && (
                  <label className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border border-neutral-200 hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-150">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 accent-amber-500 rounded"
                      checked={form.is_personal}
                      onChange={e => setForm(f => ({ ...f, is_personal: e.target.checked }))}
                    />
                    <div>
                      <p className="text-sm font-medium text-neutral-900 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-500" /> Personal agent
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">Only you can see this agent — team members won&apos;t see it.</p>
                    </div>
                  </label>
                )}
              </div>
            )}

            {/* ── Prompt ─────────────────────────────────────────────── */}
            {tab === "prompt" && (
              <div className="space-y-4">
                <Field label="System Prompt" required>
                  <textarea
                    className="input-base min-h-[160px] resize-none"
                    placeholder="You are a helpful sales agent... e.g. Hi [Customer Name], this is [Agent Name] from [Company Name]."
                    value={form.system_prompt}
                    onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                  />
                </Field>

                <Field label="Prompt Variables">
                  <p className="text-xs text-neutral-500 -mt-0.5 mb-1">
                    Use <code className="px-1 bg-neutral-100 rounded">[Placeholder]</code> in the prompt, then set its value here.
                    <span className="text-neutral-400"> <code className="px-1 bg-neutral-100 rounded">[Customer Name]</code> is filled automatically from the uploaded lead sheet.</span>
                  </p>
                  <div className="space-y-2">
                    {variables.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="input-base flex-1"
                          placeholder="Variable (e.g. Agent Name)"
                          value={v.name}
                          onChange={e => updateVariable(i, "name", e.target.value)}
                        />
                        <span className="text-neutral-400 text-sm">=</span>
                        <input
                          className="input-base flex-1"
                          placeholder="Value (e.g. Pranjal)"
                          value={v.value}
                          onChange={e => updateVariable(i, "value", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeVariable(i)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addVariable}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                    >
                      + Add variable
                    </button>
                  </div>
                </Field>
              </div>
            )}

            {/* ── Voice & Speech ─────────────────────────────────────── */}
            {tab === "voice" && (
              <div className="space-y-4">
                <Field label="Voice">
                  <VoicePicker value={form.voice_id} onChange={v => setForm(f => ({ ...f, voice_id: v }))} />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Accent">
                    <select
                      className="input-base"
                      value={(form.config as any).accent || ""}
                      onChange={e => setForm(f => ({ ...f, config: { ...f.config, accent: e.target.value } }))}
                    >
                      <option value="">Default (Neutral)</option>
                      <optgroup label="South Asian">
                        <option value="Indian English">Indian English</option>
                        <option value="Mumbai Hindi-English">Mumbai (Hindi-English)</option>
                        <option value="South Indian English">South Indian English</option>
                        <option value="Pakistani English">Pakistani English</option>
                      </optgroup>
                      <optgroup label="British">
                        <option value="British Received Pronunciation">British RP</option>
                        <option value="Scottish English">Scottish</option>
                        <option value="Australian English">Australian</option>
                      </optgroup>
                      <optgroup label="American">
                        <option value="American General">American General</option>
                        <option value="Southern American English">Southern American</option>
                        <option value="New York English">New York</option>
                      </optgroup>
                      <optgroup label="Other">
                        <option value="Nigerian English">Nigerian English</option>
                        <option value="Singaporean English">Singaporean English</option>
                        <option value="South African English">South African English</option>
                      </optgroup>
                    </select>
                  </Field>
                  <Field label="Speech Pace">
                    <select
                      className="input-base"
                      value={(form.config as any).speech_pace || "natural"}
                      onChange={e => setForm(f => ({ ...f, config: { ...f.config, speech_pace: e.target.value } }))}
                    >
                      <option value="natural">Natural</option>
                      <option value="slowly and clearly">Slow & Clear</option>
                      <option value="at a moderate pace">Moderate</option>
                      <option value="at a brisk, confident pace">Brisk & Confident</option>
                    </select>
                  </Field>
                </div>

                <Field label="Languages">
                  <LanguagePicker
                    value={(form.config as any).languages ?? ["English"]}
                    onChange={langs => setForm(f => ({ ...f, config: { ...f.config, languages: langs } }))}
                  />
                </Field>
              </div>
            )}

            {/* ── Knowledge ──────────────────────────────────────────── */}
            {tab === "knowledge" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="label-base mb-0 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-brand-500" /> Knowledge Base
                  </p>
                  <Link href="/knowledge" className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">
                    Manage
                  </Link>
                </div>
                <p className="text-xs text-neutral-500">
                  Attach knowledge bases so the agent can answer questions beyond its prompt during calls.
                </p>
                {knowledgeBases.length === 0 ? (
                  <div className="text-xs text-neutral-400 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-3">
                    No knowledge bases yet.{" "}
                    <Link href="/knowledge" className="font-medium text-brand-600 hover:text-brand-700">Create one</Link> to attach it here.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {knowledgeBases.map((kb) => {
                      const checked = selectedKbs.includes(kb.id);
                      return (
                        <label
                          key={kb.id}
                          className={`flex items-start gap-2.5 cursor-pointer p-3 rounded-xl border transition-all duration-150 ${
                            checked ? "border-brand-300 bg-brand-50/50" : "border-neutral-200 hover:border-brand-200 hover:bg-brand-50/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 w-4 h-4 accent-brand-500 rounded"
                            checked={checked}
                            onChange={() => toggleKb(kb.id)}
                          />
                          <div className="min-w-0">
                            <p className="text-sm text-neutral-800 font-medium truncate">{kb.name}</p>
                            <p className="text-[11px] text-neutral-400">{kb.ready_count}/{kb.document_count} docs ready</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Follow-up (WhatsApp) ───────────────────────────────── */}
            {tab === "followup" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-brand-500 rounded"
                    checked={(form.config as any).whatsapp_enabled ?? false}
                    onChange={e => setForm(f => ({ ...f, config: { ...f.config, whatsapp_enabled: e.target.checked } }))}
                  />
                  <span className="label-base mb-0">WhatsApp follow-up</span>
                </label>
                <p className="text-xs text-neutral-500">
                  Sends this message to the caller — automatically after the call, and on request during it.
                  Requires WhatsApp to be connected in <span className="font-medium">Settings → WhatsApp</span>.
                </p>

                {(form.config as any).whatsapp_enabled && (
                  <div className="space-y-2 pl-6">
                    <select
                      defaultValue=""
                      onChange={e => {
                        const t = WHATSAPP_TEMPLATES.find(t => t.label === e.target.value);
                        if (t) setForm(f => ({ ...f, config: { ...f.config, whatsapp_message: t.text } }));
                      }}
                      className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-brand-500"
                    >
                      <option value="" disabled>Start from a template…</option>
                      {WHATSAPP_TEMPLATES.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                    </select>
                    <textarea
                      rows={4}
                      value={(form.config as any).whatsapp_message ?? ""}
                      onChange={e => setForm(f => ({ ...f, config: { ...f.config, whatsapp_message: e.target.value } }))}
                      placeholder="Hi [Customer Name]! Thanks for calling. Here are the details you asked for…"
                      className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 resize-none"
                    />
                    <p className="text-xs text-neutral-400">
                      Variables like <span className="font-mono">[Customer Name]</span> are filled in per call.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2.5 flex-shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium shadow-xs transition-colors disabled:opacity-50"
          >
            {loading
              ? (editingAgent ? "Saving…" : "Creating…")
              : (editingAgent ? "Save Changes" : "Create Agent")}
          </button>
        </div>
      </div>
    </div>
  );
}
