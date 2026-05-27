"use client";
import { useEffect, useState } from "react";
import { Plus, Bot, Zap, Layers, Trash2, Pencil, Eye, Lock, Globe } from "lucide-react";
import Link from "next/link";
import { getAgents, createAgent, updateAgent, deleteAgent } from "@/lib/api";
import toast from "react-hot-toast";

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

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getAgents().then(setAgents).catch(() => {}); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEdit = (agent: any) => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      description: agent.description || "",
      system_prompt: agent.system_prompt,
      pipeline_mode: agent.pipeline_mode,
      llm_model: agent.llm_model,
      voice_id: agent.voice_id || "alloy",
      is_personal: agent.is_personal ?? false,
      config: {
        backchannel_enabled: agent.config?.backchannel_enabled ?? true,
        emotional_intelligence: agent.config?.emotional_intelligence ?? true,
        predictive_engine: agent.config?.predictive_engine ?? true,
        memory_graph: agent.config?.memory_graph ?? true,
        accent: agent.config?.accent ?? "",
        speech_pace: agent.config?.speech_pace ?? "natural",
        languages: agent.config?.languages ?? ["English"],
      },
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.system_prompt) {
      toast.error("Name and system prompt are required");
      return;
    }
    setLoading(true);
    try {
      if (editingId) {
        const updated = await updateAgent(editingId, form);
        setAgents(a => a.map(x => x.id === editingId ? updated : x));
        toast.success("Agent updated!");
      } else {
        const agent = await createAgent(form);
        setAgents(a => [...a, agent]);
        toast.success("Agent created!");
      }
      setShowForm(false);
      setForm(DEFAULT_FORM);
      setEditingId(null);
    } catch {
      toast.error(editingId ? "Failed to update agent" : "Failed to create agent");
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAgent(id);
      setAgents(a => a.filter(x => x.id !== id));
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 mt-1">Configure and manage your voice AI agents</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Agent
        </button>
      </div>

      {/* Agent list */}
      {agents.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <Bot className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No agents yet. Create your first agent to start calling.</p>
        </div>
      ) : (
        <>
          {/* Workspace agents */}
          {agents.filter((a: any) => !a.is_personal).length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-medium text-gray-400">Workspace Agents</h2>
                <span className="text-xs text-gray-600">— visible to all team members</span>
              </div>
              {agents.filter((a: any) => !a.is_personal).map((agent: any) => (
                <AgentCard key={agent.id} agent={agent} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Personal agents */}
          {agents.filter((a: any) => a.is_personal).length > 0 && (
            <div className="space-y-3 mt-6">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-medium text-gray-400">My Personal Agents</h2>
                <span className="text-xs text-gray-600">— only visible to you</span>
              </div>
              {agents.filter((a: any) => a.is_personal).map((agent: any) => (
                <AgentCard key={agent.id} agent={agent} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingId ? "Edit Agent" : "Create Agent"}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">✕</button>
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
              {!editingId && (
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
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? (editingId ? "Saving..." : "Creating...") : (editingId ? "Save Changes" : "Create Agent")}
              </button>
            </div>
          </div>
        </div>
      )}

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

function AgentCard({ agent, onEdit, onDelete }: { agent: any; onEdit: (a: any) => void; onDelete: (id: string) => void }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex items-start justify-between">
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          agent.pipeline_mode === "native" ? "bg-purple-500/20" : "bg-blue-500/20"
        }`}>
          {agent.pipeline_mode === "native"
            ? <Zap className="w-5 h-5 text-purple-400" />
            : <Layers className="w-5 h-5 text-blue-400" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{agent.name}</h3>
            {agent.is_personal && (
              <span className="flex items-center gap-1 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Personal
              </span>
            )}
          </div>
          {agent.description && <p className="text-sm text-gray-400 mt-0.5">{agent.description}</p>}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
              {agent.pipeline_mode === "native" ? "Native Audio" : "Classic Pipeline"}
            </span>
            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{agent.llm_model}</span>
            {agent.config?.backchannel_enabled && (
              <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">Backchannel</span>
            )}
            {agent.config?.emotional_intelligence && (
              <span className="text-xs bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded">Emotions</span>
            )}
            {agent.config?.memory_graph && (
              <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">Memory</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Link href={`/agents/${agent.id}`} className="text-gray-600 hover:text-brand-400 transition-colors p-1" title="View agent">
          <Eye className="w-4 h-4" />
        </Link>
        <button onClick={() => onEdit(agent)} className="text-gray-600 hover:text-brand-400 transition-colors p-1" title="Edit agent">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(agent.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1" title="Delete agent">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
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

const LANGUAGE_GROUPS = [
  {
    group: "Indian Languages",
    langs: ["Hindi", "Gujarati", "Marathi", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Odia", "Urdu", "Assamese", "Maithili", "Sindhi", "Sanskrit"],
  },
  {
    group: "English Variants",
    langs: ["English", "British English", "Australian English"],
  },
  {
    group: "European",
    langs: ["Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian", "Polish", "Turkish"],
  },
  {
    group: "Asian",
    langs: ["Mandarin Chinese", "Japanese", "Korean", "Indonesian", "Vietnamese", "Thai", "Malay"],
  },
  {
    group: "Middle Eastern & African",
    langs: ["Arabic", "Persian", "Hebrew", "Swahili"],
  },
];

function LanguagePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [search, setSearch] = useState("");
  const toggle = (lang: string) => {
    if (value.includes(lang)) {
      if (value.length === 1) return; // keep at least one
      onChange(value.filter(l => l !== lang));
    } else {
      onChange([...value, lang]);
    }
  };
  const q = search.toLowerCase();
  const filtered = LANGUAGE_GROUPS.map(g => ({
    ...g,
    langs: g.langs.filter(l => l.toLowerCase().includes(q)),
  })).filter(g => g.langs.length > 0);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {value.map(l => (
            <span key={l} className="flex items-center gap-1 bg-brand-500/20 text-brand-300 text-xs px-2 py-1 rounded-full">
              {l}
              {value.length > 1 && (
                <button type="button" onClick={() => toggle(l)} className="text-brand-400 hover:text-white ml-0.5">×</button>
              )}
            </span>
          ))}
          {value.length > 1 && (
            <span className="text-xs text-gray-500 self-center">First selected = primary language</span>
          )}
        </div>
      )}
      <input
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
        placeholder="Search languages..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
        {filtered.map(g => (
          <div key={g.group}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">{g.group}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.langs.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggle(l)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    value.includes(l)
                      ? "bg-brand-500/20 border-brand-500 text-brand-300"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const VOICES = [
  { id: "alloy",   label: "Alloy",   gender: "Neutral",  tone: "Balanced & versatile",          color: "from-violet-500 to-purple-600" },
  { id: "ash",     label: "Ash",     gender: "Male",     tone: "Confident & direct",             color: "from-slate-500 to-gray-600" },
  { id: "ballad",  label: "Ballad",  gender: "Male",     tone: "Warm & storytelling",            color: "from-amber-500 to-orange-600" },
  { id: "coral",   label: "Coral",   gender: "Female",   tone: "Bright & energetic",             color: "from-rose-500 to-pink-600" },
  { id: "echo",    label: "Echo",    gender: "Male",     tone: "Clear & professional",           color: "from-cyan-500 to-blue-600" },
  { id: "sage",    label: "Sage",    gender: "Female",   tone: "Calm & reassuring",              color: "from-emerald-500 to-green-600" },
  { id: "shimmer", label: "Shimmer", gender: "Female",   tone: "Soft & approachable",            color: "from-sky-400 to-indigo-500" },
  { id: "verse",   label: "Verse",   gender: "Neutral",  tone: "Expressive & dynamic",           color: "from-fuchsia-500 to-violet-600" },
];

function VoicePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {VOICES.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={`relative flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
            value === v.id
              ? "border-brand-500 bg-brand-500/10"
              : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
          }`}
        >
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${v.color} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold`}>
            {v.label[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-white">{v.label}</span>
              <span className="text-xs text-gray-500">{v.gender}</span>
            </div>
            <p className="text-xs text-gray-400 truncate">{v.tone}</p>
          </div>
          {value === v.id && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500" />
          )}
        </button>
      ))}
    </div>
  );
}
