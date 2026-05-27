"use client";
import { useEffect, useState } from "react";
import {
  Plus, Wrench, AlertCircle, ToggleRight, ToggleLeft, Pencil, Trash
} from "lucide-react";
import { getTools, updateTool, deleteTool } from "@/lib/api";
import toast from "react-hot-toast";
import { ToolModal } from "./ToolModal";

const TOOL_TYPES = [
  {
    value: "webhook",
    label: "Webhook / HTTP",
    icon: Wrench,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    description: "Call any HTTP endpoint — CRM, calendar, booking system, etc.",
  },
  {
    value: "end_call",
    label: "End Call",
    icon: Wrench,
    color: "text-red-400",
    bg: "bg-red-500/10",
    description: "Agent ends the call cleanly after completing its task.",
  },
  {
    value: "transfer_call",
    label: "Transfer to Human",
    icon: Wrench,
    color: "text-green-400",
    bg: "bg-green-500/10",
    description: "Warm-transfer the caller to a human agent.",
  },
  {
    value: "calendar_booking",
    label: "Book Appointment",
    icon: Wrench,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    description: "Check real availability and book appointments via Cal.com or Calendly API.",
  },
];

interface Tool {
  id: string;
  name: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
  config: Record<string, any>;
  enabled: boolean;
}

interface ToolsTabProps {
  agentId: string;
  onToolsChange?: (count: number) => void;
}

export function ToolsTab({ agentId, onToolsChange }: ToolsTabProps) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);

  useEffect(() => {
    getTools(agentId)
      .then(t => {
        setTools(t);
        if (onToolsChange) onToolsChange(t.length);
      })
      .catch(() => toast.error("Failed to load tools"))
      .finally(() => setLoading(false));
  }, [agentId, onToolsChange]);

  const handleSaved = (tool: Tool) => {
    setTools(prev => {
      let next;
      const idx = prev.findIndex(t => t.id === tool.id);
      if (idx >= 0) {
        next = [...prev];
        next[idx] = tool;
      } else {
        next = [...prev, tool];
      }
      if (onToolsChange) onToolsChange(next.length);
      return next;
    });
    setShowModal(false);
    setEditing(null);
  };

  const handleToggle = async (tool: Tool) => {
    try {
      const updated = await updateTool(agentId, tool.id, { enabled: !tool.enabled });
      setTools(prev => prev.map(t => t.id === tool.id ? updated : t));
    } catch {
      toast.error("Failed to toggle tool");
    }
  };

  const handleDelete = async (tool: Tool) => {
    if (!confirm(`Delete tool "${tool.name}"?`)) return;
    try {
      await deleteTool(agentId, tool.id);
      setTools(prev => {
        const next = prev.filter(t => t.id !== tool.id);
        if (onToolsChange) onToolsChange(next.length);
        return next;
      });
      toast.success("Tool deleted");
    } catch {
      toast.error("Failed to delete tool");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Function Tools</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Tools the AI can call during a live conversation to take actions.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Tool
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-300">
          Tools are passed to the AI as callable functions. The agent decides when to call them based on the conversation context and tool descriptions.
        </p>
      </div>

      {/* Tool type legend */}
      <div className="grid grid-cols-3 gap-3">
        {TOOL_TYPES.map(tt => (
          <div key={tt.value} className={`rounded-xl p-3 border border-gray-800 ${tt.bg}/20 flex items-start gap-2.5`}>
            <div className={`w-7 h-7 rounded-lg ${tt.bg} flex items-center justify-center flex-shrink-0`}>
              <tt.icon className={`w-4 h-4 ${tt.color}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-200">{tt.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{tt.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tools list */}
      {tools.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800 border-dashed">
          <Wrench className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No tools configured yet</p>
          <p className="text-xs text-gray-500 mt-1">Add a webhook, end-call, or transfer tool to get started</p>
          <button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" /> Add First Tool
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tools.map(tool => {
            const meta = TOOL_TYPES.find(t => t.value === tool.type);
            const Icon = meta?.icon ?? Wrench;
            const paramCount = Object.keys((tool.parameters as {properties?: object})?.properties ?? {}).length;
            return (
              <div
                key={tool.id}
                className={`bg-gray-900 border rounded-xl p-4 transition-all ${
                  tool.enabled ? "border-gray-700" : "border-gray-800 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${meta?.bg ?? "bg-gray-800"} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${meta?.color ?? "text-gray-400"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-medium text-white">{tool.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${meta?.bg ?? "bg-gray-800"} ${meta?.color ?? "text-gray-400"}`}>
                          {meta?.label ?? tool.type}
                        </span>
                        {!tool.enabled && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">disabled</span>
                        )}
                      </div>
                      {tool.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{tool.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {tool.type === "webhook" && !!tool.config?.url && (
                          <span className="text-xs text-gray-500 font-mono truncate max-w-xs">
                            {String(tool.config.url)}
                          </span>
                        )}
                        {tool.type === "transfer_call" && !!tool.config?.transfer_to && (
                          <span className="text-xs text-gray-500 font-mono">
                            → {String(tool.config.transfer_to)}
                          </span>
                        )}
                        {tool.type === "calendar_booking" && !!tool.config?.integration && (
                          <span className="text-xs text-gray-500">
                            via {String(tool.config.integration) === "calcom" ? "Cal.com" : "Calendly"}
                            {tool.config.timezone ? ` · ${String(tool.config.timezone)}` : ""}
                          </span>
                        )}
                        {paramCount > 0 && (
                          <span className="text-xs text-gray-600">{paramCount} param{paramCount !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(tool)}
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                      title={tool.enabled ? "Disable" : "Enable"}
                    >
                      {tool.enabled
                        ? <ToggleRight className="w-5 h-5 text-green-400" />
                        : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={() => { setEditing(tool); setShowModal(true); }}
                      className="text-gray-500 hover:text-gray-300 transition-colors p-1"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(tool)}
                      className="text-gray-500 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ToolModal
          agentId={agentId}
          existing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
