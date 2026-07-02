"use client";
import { useEffect, useState } from "react";
import { Lock, X, BookOpen, User, FileText, AudioLines, MessageCircle, Check } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import Link from "next/link";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createAgent, updateAgent, getKnowledgeBases } from "@/lib/api";
import { VoicePicker } from "./VoicePicker";
import { LanguagePicker } from "./LanguagePicker";
import { FormField, InputField, SelectField } from "@/components/ui/FormField";
import type { FieldError } from "react-hook-form";

const agentSchema = z.object({
  name: z.string().min(1, "Agent name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional().default(""),
  system_prompt: z.string().min(10, "System prompt must be at least 10 characters"),
  voice_id: z.string().min(1, "Voice is required"),
  accent: z.string().optional().default(""),
  speech_pace: z.string().optional().default("natural"),
  languages: z.array(z.string()).min(1, "At least one language is required"),
  knowledge_base_ids: z.array(z.string()).optional().default([]),
  whatsapp_enabled: z.boolean().optional().default(false),
  whatsapp_message: z.string().optional().default(""),
});

type AgentFormValues = z.infer<typeof agentSchema>;

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

const STEPS = [
  { id: "basics", label: "Basics", icon: User },
  { id: "prompt", label: "Prompt", icon: FileText },
  { id: "voice", label: "Voice & Speech", icon: AudioLines },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "followup", label: "Follow-up", icon: MessageCircle },
] as const;

const STEP_FIELDS: Record<number, (keyof AgentFormValues)[]> = {
  0: ["name", "description"],
  1: ["system_prompt"],
  2: ["voice_id", "accent", "speech_pace", "languages"],
  3: ["knowledge_base_ids"],
  4: ["whatsapp_enabled", "whatsapp_message"],
};

export function AgentFormModal({ editingAgent, onClose, onSaved }: AgentFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [isPersonal, setIsPersonal] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([]);
  const [step, setStep] = useState(0);
  const [variables, setVariables] = useState<{ name: string; value: string }[]>([]);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors }, trigger, getValues } = useForm<AgentFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(agentSchema) as any,
    defaultValues: {
      name: "",
      description: "",
      system_prompt: "You are a helpful sales agent calling leads. Be friendly and professional.",
      voice_id: "Aoede",
      accent: "",
      speech_pace: "natural",
      languages: ["English"],
      knowledge_base_ids: [],
      whatsapp_enabled: false,
      whatsapp_message: "",
    },
  });

  useEffect(() => {
    getKnowledgeBases().then(setKnowledgeBases).catch(() => {});
  }, []);

  useEffect(() => {
    if (editingAgent) {
      reset({
        name: editingAgent.name,
        description: editingAgent.description || "",
        system_prompt: editingAgent.system_prompt,
        voice_id: editingAgent.voice_id || "Aoede",
        accent: editingAgent.config?.accent ?? "",
        speech_pace: editingAgent.config?.speech_pace ?? "natural",
        languages: editingAgent.config?.languages ?? ["English"],
        knowledge_base_ids: editingAgent.config?.knowledge_base_ids ?? [],
        whatsapp_enabled: editingAgent.config?.whatsapp_enabled ?? false,
        whatsapp_message: editingAgent.config?.whatsapp_message ?? "",
      });
      setIsPersonal(editingAgent.is_personal ?? false);
      setVariables(editingAgent.config?.variables ?? []);
    } else {
      reset();
      setIsPersonal(false);
      setVariables([]);
    }
    setStep(0);
  }, [editingAgent]);

  const addVariable = () => setVariables([...variables, { name: "", value: "" }]);
  const updateVariable = (i: number, key: "name" | "value", val: string) =>
    setVariables(variables.map((v, idx) => (idx === i ? { ...v, [key]: val } : v)));
  const removeVariable = (i: number) => setVariables(variables.filter((_, idx) => idx !== i));

  const selectedKbs = watch("knowledge_base_ids") ?? [];
  const toggleKb = (id: string) => {
    const cur = getValues("knowledge_base_ids") ?? [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setValue("knowledge_base_ids", next, { shouldValidate: true });
  };

  const onFormSubmit = handleSubmit(async (data) => {
    setLoading(true);
    try {
      const payload = {
        name: data.name,
        description: data.description,
        system_prompt: data.system_prompt,
        pipeline_mode: "native",
        llm_model: "Tierce Voice Engine",
        voice_id: data.voice_id,
        is_personal: isPersonal,
        config: {
          backchannel_enabled: true,
          emotional_intelligence: true,
          predictive_engine: true,
          memory_graph: true,
          accent: data.accent,
          speech_pace: data.speech_pace,
          languages: data.languages,
          knowledge_base_ids: data.knowledge_base_ids,
          variables,
          whatsapp_enabled: data.whatsapp_enabled,
          whatsapp_message: data.whatsapp_message,
        },
      };
      if (editingAgent) {
        const updated = await updateAgent(editingAgent.id, payload);
        toast.success("Agent updated!");
        onSaved(updated, true);
        onClose();
      } else {
        const tempId = `optimistic-${Date.now()}`;
        const optimisticAgent = {
          id: tempId,
          name: data.name,
          description: data.description,
          system_prompt: data.system_prompt,
          voice_id: data.voice_id,
          accent: data.accent,
          speech_pace: data.speech_pace,
          languages: data.languages,
          knowledge_base_ids: data.knowledge_base_ids,
          ...(payload.config ? { config: payload.config } : {}),
          _optimistic: true,
          created_at: new Date().toISOString(),
        };
        onSaved(optimisticAgent, false);
        try {
          const created = await createAgent(payload);
          onSaved(created, false);
          toast.success("Agent created!");
          onClose();
        } catch {
          toast.error("Failed to create agent");
        }
      }
    } catch {
      toast.error(editingAgent ? "Failed to update agent" : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }, (errs) => {
    for (let i = 0; i < 5; i++) {
      if (STEP_FIELDS[i].some(f => errs[f])) {
        setStep(i);
        return;
      }
    }
  });

  const goToNextStep = async () => {
    if (step === 4) {
      onFormSubmit();
    } else {
      const fields = STEP_FIELDS[step];
      const valid = await trigger(fields as any);
      if (valid) setStep(s => s + 1);
    }
  };

  const goToPrevStep = () => {
    setStep(s => s - 1);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="agent-modal-title">
      <div ref={dialogRef} className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 shadow-modal w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
          <h2 id="agent-modal-title" className="text-[15px] font-semibold text-neutral-900">
            {editingAgent ? "Edit Agent" : "Create Agent"}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="icon-sm" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-3 border-b border-neutral-100 flex-shrink-0">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i <= step ? "bg-brand-500" : "bg-neutral-200"}`} />
                )}
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
                    i < step
                      ? "bg-brand-500 text-white"
                      : i === step
                        ? "bg-brand-500 text-white ring-4 ring-brand-100"
                        : "bg-neutral-100 text-neutral-400"
                  }`}>
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`mt-1.5 text-[11px] font-medium whitespace-nowrap ${
                    i <= step ? "text-neutral-700" : "text-neutral-400"
                  }`}>
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-1">
            <span className="text-xs text-neutral-400">Step {step + 1} of 5</span>
          </div>
        </div>

        {/* Content */}
        <div key={step} className="p-6 space-y-4 overflow-y-auto scroll-thin flex-1 min-h-0 animate-fade-in">
          {/* ── Step 0: Basics ──────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4">
              <InputField
                label="Name"
                id="agent-name"
                required
                registration={register("name")}
                error={errors.name}
                placeholder="e.g. Sales Agent"
              />

              <InputField
                label="Description"
                id="agent-description"
                registration={register("description")}
                error={errors.description}
                placeholder="Optional description"
              />

              {!editingAgent && (
                <label htmlFor="personal-agent" className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border border-neutral-200 hover:border-warning-300 hover:bg-warning-50/40 transition-all duration-150">
                  <input
                    id="personal-agent"
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-warning-500 rounded"
                    checked={isPersonal}
                    onChange={e => setIsPersonal(e.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-medium text-neutral-900 flex items-center gap-1.5">
                      <Lock className="icon-xs text-warning-500" /> Personal agent
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">Only you can see this agent — team members won&apos;t see it.</p>
                  </div>
                </label>
              )}
            </div>
          )}

          {/* ── Step 1: Prompt ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              <InputField
                label="System Prompt"
                id="system-prompt"
                required
                registration={register("system_prompt")}
                error={errors.system_prompt}
                placeholder="You are a helpful sales agent... e.g. Hi [Customer Name], this is [Agent Name] from [Company Name]."
                rows={6}
              />

              <FormField label="Prompt Variables">
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
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-error-500 hover:bg-error-50 transition-colors shrink-0"
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
              </FormField>
            </div>
          )}

          {/* ── Step 2: Voice & Speech ─────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <FormField label="Voice" error={errors.voice_id} required>
                <VoicePicker value={watch("voice_id")} onChange={v => setValue("voice_id", v, { shouldValidate: true })} />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Accent" error={errors.accent}>
                  <select {...register("accent")} className="input-base">
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
                </FormField>
                <SelectField
                  label="Speech Pace"
                  id="speech-pace"
                  registration={register("speech_pace")}
                  error={errors.speech_pace}
                  options={[
                    { value: "natural", label: "Natural" },
                    { value: "slowly and clearly", label: "Slow & Clear" },
                    { value: "at a moderate pace", label: "Moderate" },
                    { value: "at a brisk, confident pace", label: "Brisk & Confident" },
                  ]}
                />
              </div>

              <FormField label="Languages" error={errors.languages as FieldError | undefined} required>
                <LanguagePicker
                  value={watch("languages")}
                  onChange={langs => setValue("languages", langs, { shouldValidate: true })}
                />
              </FormField>
            </div>
          )}

          {/* ── Step 3: Knowledge ──────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="label-base mb-0 flex items-center gap-1.5">
                  <BookOpen className="icon-xs text-brand-500" /> Knowledge Base
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
                        htmlFor={`kb-${kb.id}`}
                        className={`flex items-start gap-2.5 cursor-pointer p-3 rounded-xl border transition-all duration-150 ${
                          checked ? "border-brand-300 bg-brand-50/50" : "border-neutral-200 hover:border-brand-200 hover:bg-brand-50/20"
                        }`}
                      >
                        <input
                          id={`kb-${kb.id}`}
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
              {errors.knowledge_base_ids && (
                <p className="text-xs text-error-600 flex items-center gap-1">{errors.knowledge_base_ids.message || errors.knowledge_base_ids.root?.message}</p>
              )}
            </div>
          )}

          {/* ── Step 4: Follow-up (WhatsApp) ───────────────────────── */}
          {step === 4 && (
            <div className="space-y-2">
              <label htmlFor="whatsapp-followup" className="flex items-center gap-2.5 cursor-pointer">
                <input
                  id="whatsapp-followup"
                  type="checkbox"
                  className="w-4 h-4 accent-brand-500 rounded"
                  checked={watch("whatsapp_enabled")}
                  onChange={e => setValue("whatsapp_enabled", e.target.checked, { shouldValidate: true })}
                />
                <span className="label-base mb-0">WhatsApp follow-up</span>
              </label>
              <p className="text-xs text-neutral-500">
                Sends this message to the caller — automatically after the call, and on request during it.
                Requires WhatsApp to be connected in <span className="font-medium">Settings → WhatsApp</span>.
              </p>

              {watch("whatsapp_enabled") && (
                <div className="space-y-2 pl-6">
                  <select
                    defaultValue=""
                    onChange={e => {
                      const t = WHATSAPP_TEMPLATES.find(t => t.label === e.target.value);
                      if (t) setValue("whatsapp_message", t.text, { shouldValidate: true });
                    }}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-brand-500"
                  >
                    <option value="" disabled>Start from a template…</option>
                    {WHATSAPP_TEMPLATES.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                  </select>
                  <textarea
                    {...register("whatsapp_message")}
                    rows={4}
                    placeholder="Hi [Customer Name]! Thanks for calling. Here are the details you asked for…"
                    className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 resize-none"
                  />
                  <p className="text-xs text-neutral-400">
                    Variables like <span className="font-mono">[Customer Name]</span> are filled in per call.
                  </p>
                  {errors.whatsapp_message && (
                    <p className="text-xs text-error-600 flex items-center gap-1">{errors.whatsapp_message.message}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2.5">
            {step > 0 && (
              <button
                onClick={goToPrevStep}
                className="h-9 px-4 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={goToNextStep}
              disabled={loading}
              className="h-9 px-5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium shadow-xs transition-colors disabled:opacity-50"
            >
              {step === 4
                ? (loading
                  ? (editingAgent ? "Saving…" : "Creating…")
                  : (editingAgent ? "Save Changes" : "Create Agent"))
                : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
