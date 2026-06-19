"use client";
import Link from "next/link";
import { Zap, Lock, Eye, Pencil, Trash2 } from "lucide-react";

interface AgentCardProps {
  agent: any;
  onEdit: (a: any) => void;
  onDelete: (id: string) => void;
}

export function AgentCard({ agent, onEdit, onDelete }: AgentCardProps) {
  return (
    <div className="group bg-white rounded-xl border border-neutral-200 shadow-card p-4 flex items-start justify-between hover:shadow-hover hover:border-neutral-300 transition-all duration-200">
      <div className="flex items-start gap-3.5 min-w-0">
        {/* Icon */}
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-violet-50">
          <Zap className="w-4 h-4 text-violet-500" />
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
