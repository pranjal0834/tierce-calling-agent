"use client";
import { useEffect, useState } from "react";
import { Plus, Bot, Globe, Lock } from "lucide-react";
import { getAgents, deleteAgent } from "@/lib/api";
import toast from "react-hot-toast";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentFormModal } from "@/components/agents/AgentFormModal";

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);

  const loadAgents = () => {
    getAgents().then(setAgents).catch(() => {});
  };

  useEffect(() => { loadAgents(); }, []);

  const openCreate = () => {
    setEditingAgent(null);
    setShowForm(true);
  };

  const openEdit = (agent: any) => {
    setEditingAgent(agent);
    setShowForm(true);
  };

  const handleSaved = (agent: any, isEdit: boolean) => {
    if (isEdit) {
      setAgents(a => a.map(x => x.id === agent.id ? agent : x));
    } else {
      setAgents(a => [...a, agent]);
    }
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    try {
      await deleteAgent(id);
      setAgents(a => a.filter(x => x.id !== id));
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Agents</h1>
          <p className="text-neutral-500 mt-1">Configure and manage your voice AI agents</p>
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
        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed border-neutral-300 rounded-2xl">
          <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <Bot className="w-7 h-7 text-neutral-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-500">No agents yet</p>
            <p className="text-xs text-neutral-400 mt-1">Create your first agent to start making calls.</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> New Agent
          </button>
        </div>
      ) : (
        <>
          {/* Workspace agents */}
          {agents.filter((a: any) => !a.is_personal).length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-neutral-400" />
                <h2 className="text-sm font-medium text-neutral-500">Workspace Agents</h2>
                <span className="text-xs text-neutral-400">— visible to all team members</span>
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
                <h2 className="text-sm font-medium text-neutral-500">My Personal Agents</h2>
                <span className="text-xs text-neutral-400">— only visible to you</span>
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
        <AgentFormModal
          editingAgent={editingAgent}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
