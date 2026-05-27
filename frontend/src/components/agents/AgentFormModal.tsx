"use client";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { createAgent, updateAgent } from "@/lib/api";
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
  },
};

interface AgentFormModalProps {
  editingAgent: any | null;
  onClose: () => void;
  onSaved: (agent: any, isEdit: boolean) => void;
}

export function AgentFormModal({ editingAgent, onClose, onSaved }: AgentFormModalProps) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);

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
          backchannel_enabled: editingAgent.config?.backchannel_enabled ?? true,
          emotional_intelligence: editingAgent.config?.emotional_intelligence ?? true,
          predictive_engine: editingAgent.config?.predictive_engine ?? true,
          memory_graph: editingAgent.config?.memory_graph ?? true,
          accent: editingAgent.config?.accent ?? "",
          speech_pace: editingAgent.config?.speech_pace ?? "natural",
          languages: editingAgent.config?.languages ?? ["English"],
        },
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [editingAgent]);

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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {editingAgent ? "Edit Agent" : "Create Agent"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Name" required>
            <input
              className="input"
              placeholder="e.g. Sales Agent"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Description">
            <input
              className="input"
              placeholder="Optional description"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </Field>

          {/* Personal toggle — only shown when creating */}
          {!editingAgent && (
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-700 hover:border-amber-500/40 transition-colors">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 accent-amber-500"
                checked={form.is_personal}
                onChange={e => setForm(f => ({ ...f, is_personal: e.target.checked }))}
              />
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" /> Personal agent
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Only you can see this agent — team members won&apos;t see it.</p>
              </div>
            </label>
          )}

          <Field label="System Prompt" required>
            <textarea
              className="input min-h-[120px] resize-none"
              placeholder="You are a helpful sales agent..."
              value={form.system_prompt}
              onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
            />
          </Field>
          <Field label="Pipeline Mode">
            <select
              className="input"
              value={form.pipeline_mode}
              onChange={e => setForm(f => ({ ...f, pipeline_mode: e.target.value }))}
            >
              <option value="native">Native Audio (GPT-4o Realtime) — Recommended</option>
              <option value="classic">Classic Pipeline (STT → LLM → TTS)</option>
            </select>
          </Field>
          <Field label="Voice">
            <VoicePicker value={form.voice_id} onChange={v => setForm(f => ({ ...f, voice_id: v }))} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Accent">
              <select
                className="input"
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
                className="input"
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

          <div className="pt-2 space-y-3">
            <p className="text-sm font-medium text-gray-300">Features</p>
            {([
              ["backchannel_enabled", "Backchannel Engine (mm-hmm, uh-huh)"],
              ["emotional_intelligence", "Emotional Intelligence Layer"],
              ["predictive_engine", "Predictive Conversation Engine"],
              ["memory_graph", "Deep Memory Graph"],
            ] as [string, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-brand-500"
                  checked={(form.config as any)[key]}
                  onChange={e => setForm(f => ({
                    ...f,
                    config: { ...f.config, [key]: e.target.checked },
                  }))}
                />
                <span className="text-sm text-gray-300">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? (editingAgent ? "Saving..." : "Creating...") : (editingAgent ? "Save Changes" : "Create Agent")}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          background: #111827;
          border: 1px solid #374151;
          border-radius: 8px;
          padding: 8px 12px;
          color: white;
          font-size: 14px;
          outline: none;
        }
        .input:focus { border-color: #4f46e5; }
      `}</style>
    </div>
  );
}

function Field({ label, children, required }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-gray-300 font-medium">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
