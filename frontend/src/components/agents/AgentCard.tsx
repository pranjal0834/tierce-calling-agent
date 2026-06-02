"use client";
import Link from "next/link";
import { Zap, Layers, Lock, Eye, Pencil, Trash2 } from "lucide-react";

interface AgentCardProps {
  agent: any;
  onEdit: (a: any) => void;
  onDelete: (id: string) => void;
}

const featurePills: Record<string, { label: string; cls: string }> = {
  backchannel_enabled:     { label: "Backchannel", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  emotional_intelligence:  { label: "Emotions",    cls: "bg-pink-50 text-pink-700 border-pink-100" },
  memory_graph:            { label: "Memory",      cls: "bg-blue-50 text-blue-700 border-blue-100" },
};

export function AgentCard({ agent, onEdit, onDelete }: AgentCardProps) {
  const isNative = agent.pipeline_mode === "native";

  return (
    <div className="group bg-white rounded-xl border border-neutral-200 shadow-card p-4 flex items-start justify-between hover:shadow-hover hover:border-neutral-300 transition-all duration-200">
      <div className="flex items-start gap-3.5 min-w-0">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isNative ? "bg-violet-50" : "bg-blue-50"
        }`}>
          {isNative
            ? <Zap    className="w-4 h-4 text-violet-500" />
            : <Layers className="w-4 h-4 text-blue-500" />}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-semibold text-neutral-900 leading-tight">{agent.name}</h3>
            {agent.is_personal && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> Personal
              </span>
            )}
          </div>

          {agent.description && (
            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed truncate max-w-full sm:max-w-[380px]">
              {agent.description}
            </p>
          )}

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${
              isNative ? "bg-violet-50 text-violet-700 border-violet-100" : "bg-blue-50 text-blue-700 border-blue-100"
            }`}>
              {isNative ? "Native Audio" : "Classic Pipeline"}
            </span>
            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
              {agent.llm_model}
            </span>
            {Object.entries(featurePills).map(([key, { label, cls }]) =>
              agent.config?.[key] ? (
                <span key={key} className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
                  {label}
                </span>
              ) : null
            )}
          </div>
        </div>
      </div>

      {/* Actions — always visible on touch, hover-reveal on desktop */}
      <div className="flex items-center gap-0.5 flex-shrink-0 ml-2 sm:ml-3 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150">
        <Link
          href={`/agents/${agent.id}`}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
          title="View agent"
        >
          <Eye className="w-3.5 h-3.5" />
        </Link>
        <button
          onClick={() => onEdit(agent)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
          title="Edit agent"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(agent.id)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete agent"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
