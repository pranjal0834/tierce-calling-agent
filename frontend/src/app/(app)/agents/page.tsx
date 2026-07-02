"use client";
import { useEffect, useState } from "react";
import { Plus, Bot, Globe, Lock } from "lucide-react";
import { getAgents, deleteAgent, createAgent } from "@/lib/api";
import toast from "react-hot-toast";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentFormModal } from "@/components/agents/AgentFormModal";
import { toastUndo } from "@/lib/toast-undo";

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const loadAgents = () => {
    getAgents().then(setAgents).catch(() => {});
  };

  useEffect(() => { loadAgents(); }, []);

  // Deep-link from the command palette: /agents?new=1 opens the create form.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new")) {
      setEditingAgent(null); setShowForm(true);
    }
  }, []);

  const openCreate = () => { setEditingAgent(null); setShowForm(true); };
  const openEdit   = (agent: any) => { setEditingAgent(agent); setShowForm(true); };

  const handleSaved = (agent: any, isEdit: boolean) => {
    if (isEdit) setAgents(a => a.map(x => x.id === agent.id ? agent : x));
    else        setAgents(a => [...a, agent]);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    const item = agents.find(a => a.id === id);
    if (!item) return;
    await deleteAgent(id);
    setAgents(a => a.filter(x => x.id !== id));
    toastUndo({
      message: "Agent deleted",
      onUndo: async () => {
        const restored = await createAgent(item);
        setAgents(a => [...a, restored]);
      },
    });
  };

  const workspace = agents.filter((a: any) => !a.is_personal);
  const personal  = agents.filter((a: any) => a.is_personal);

  return (
    <div className="space-y-6">
      {/* Page actions */}
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" /> New Agent
        </button>
      </div>

      {/* Empty state */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 bg-white border border-dashed border-neutral-300 rounded-2xl">
          <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-neutral-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-neutral-700">No agents yet</p>
            <p className="text-xs text-neutral-400 mt-1">Create your first agent to start making calls.</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" /> New Agent
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Workspace agents */}
          {workspace.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 px-0.5 mb-3">
                <Globe className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Workspace</span>
                <span className="text-xs text-neutral-400 truncate">· visible to all team members</span>
              </div>
              {workspace.map((agent: any) => (
                <AgentCard key={agent.id} agent={agent} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Personal agents */}
          {personal.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 px-0.5 mb-3">
                <Lock className="w-3.5 h-3.5 text-warning-500 shrink-0" />
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Personal</span>
                <span className="text-xs text-neutral-400 truncate">· only visible to you</span>
              </div>
              {personal.map((agent: any) => (
                <AgentCard key={agent.id} agent={agent} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}

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
