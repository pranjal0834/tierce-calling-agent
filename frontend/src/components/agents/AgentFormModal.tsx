"use client";
import { useEffect, useState } from "react";
import { Lock, X, BookOpen } from "lucide-react";
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
  llm_model: "gpt-4o-realtime-preview",
  voice_id: "alloy",
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
  },
};

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

export function AgentFormModal({ editingAgent, onClose, onSaved }: AgentFormModalProps) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);

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
        voice_id: editingAgent.voice_id || "alloy",
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
        },
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [editingAgent]);

  const selectedKbs: string[] = (form.config as any).knowledge_base_ids ?? [];
  const toggleKb = (id: string) => {
    setForm(f => {
      const cur: string[] = (f.config as any).knowledge_base_ids ?? [];
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      return { ...f, config: { ...f.config, knowledge_base_ids: next } };
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.system_prompt) {
      toast.error("Name and system prompt are required");
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
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-modal w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
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

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto scroll-thin flex-1">
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

          {/* Personal toggle */}
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

          <Field label="System Prompt" required>
            <textarea
              className="input-base min-h-[120px] resize-none"
              placeholder="You are a helpful sales agent..."
              value={form.system_prompt}
              onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
            />
          </Field>


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

          <Field label="AI Engine">
            <select
              className="input-base"
              value={(form.config as any).engine || ""}
              onChange={e => setForm(f => ({ ...f, config: { ...f.config, engine: e.target.value } }))}
            >
              <option value="">Default (system setting)</option>
              <option value="openai">OpenAI Realtime (best for English)</option>
              <option value="gemini">Gemini Live (best for Hindi / Gujarati / regional)</option>
            </select>
            <p className="mt-1.5 text-xs text-neutral-500">
              Gemini handles Indian regional languages better and costs less; OpenAI is strongest in English.
              Leave on Default to use the system-wide engine.
            </p>
          </Field>

          {/* Features */}
          <div className="pt-1 space-y-1">
            <p className="label-base mb-3">Features</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["backchannel_enabled",    "Backchannel Engine"],
                ["emotional_intelligence", "Emotional Intelligence"],
                ["predictive_engine",      "Predictive Engine"],
                ["memory_graph",           "Deep Memory Graph"],
              ] as [string, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border border-neutral-200 hover:border-brand-200 hover:bg-brand-50/30 transition-all duration-150">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-brand-500 rounded"
                    checked={(form.config as any)[key]}
                    onChange={e => setForm(f => ({
                      ...f,
                      config: { ...f.config, [key]: e.target.checked },
                    }))}
                  />
                  <span className="text-sm text-neutral-700 font-medium">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Knowledge Base */}
          <div className="pt-1 space-y-2">
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
