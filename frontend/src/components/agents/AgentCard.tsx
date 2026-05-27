"use client";
import Link from "next/link";
import { Zap, Layers, Lock, Eye, Pencil, Trash2 } from "lucide-react";

interface AgentCardProps {
  agent: any;
  onEdit: (a: any) => void;
  onDelete: (id: string) => void;
}

export function AgentCard({ agent, onEdit, onDelete }: AgentCardProps) {
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
