"use client";
import { useEffect, useRef, useState } from "react";
import { Brain, User, Building, ShoppingBag, AlertCircle, Heart, Calendar, Trash2 } from "lucide-react";
import { getContacts, getMemoryGraph, clearMemory } from "@/lib/api";
import toast from "react-hot-toast";

const NODE_ICONS: Record<string, any> = {
  person:     User,
  company:    Building,
  product:    ShoppingBag,
  issue:      AlertCircle,
  preference: Heart,
  event:      Calendar,
};

const NODE_COLORS: Record<string, string> = {
  person:     "bg-blue-50 text-blue-600 border-blue-200",
  company:    "bg-brand-50 text-brand-600 border-brand-200",
  product:    "bg-green-50 text-green-600 border-green-200",
  issue:      "bg-red-50 text-red-600 border-red-200",
  preference: "bg-pink-50 text-pink-600 border-pink-200",
  event:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  fact:       "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export default function MemoryPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const graphReqRef = useRef(0);

  useEffect(() => {
    getContacts().then(setContacts).catch(() => {});
  }, []);

  const openContact = async (contact: any) => {
    setSelected(contact);
    setGraph(null);
    const reqId = ++graphReqRef.current;
    const g = await getMemoryGraph(contact.id).catch(() => null);
    if (reqId === graphReqRef.current) setGraph(g);
  };

  const handleClearMemory = async () => {
    if (!selected) return;
    try {
      await clearMemory(selected.id);
      setGraph({ contact_id: selected.id, nodes: [], edges: [] });
      toast.success("Memory cleared");
    } catch {
      toast.error("Failed to clear memory");
    }
  };

  const grouped = (graph?.nodes || []).reduce((acc: any, n: any) => {
    acc[n.node_type] = [...(acc[n.node_type] || []), n];
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Memory Graph</h1>
        <p className="text-neutral-500 mt-1">
          Hyper-personalized contact knowledge — every fact remembered across all calls
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact list */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <div className="px-5 py-4 border-b border-neutral-200 text-sm font-medium text-neutral-700">
            Contacts ({contacts.length})
          </div>
          <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
            {contacts.length === 0 && (
              <div className="p-8 text-center text-neutral-500 text-sm">No contacts yet</div>
            )}
            {contacts.map((c: any) => (
              <button
                key={c.id}
                onClick={() => openContact(c)}
                className={`w-full px-5 py-4 text-left hover:bg-neutral-50 flex items-center gap-3 transition-colors ${
                  selected?.id === c.id ? "bg-brand-50" : ""
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">{c.name || c.phone_number}</p>
                  {c.company && <p className="text-xs text-neutral-400 truncate">{c.company}</p>}
                  <p className="text-xs text-neutral-400">{c.phone_number}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Memory graph detail */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-neutral-200 shadow-sm">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center">
              <Brain className="w-12 h-12 text-neutral-300 mb-3" />
              <p className="text-neutral-500 text-sm">Select a contact to view their memory graph</p>
            </div>
          ) : (
            <div>
              <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-neutral-900">{selected.name || selected.phone_number}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {graph?.nodes?.length || 0} memory nodes · {graph?.edges?.length || 0} relationships
                  </p>
                </div>
                <button
                  onClick={handleClearMemory}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Memory
                </button>
              </div>

              <div className="p-5 space-y-5">
                {Object.keys(grouped).length === 0 && (
                  <p className="text-neutral-500 text-sm text-center py-8">
                    No memories yet. Complete a call with this contact to start building their memory graph.
                  </p>
                )}

                {Object.entries(grouped).map(([type, nodes]: [string, any]) => {
                  const Icon = NODE_ICONS[type] || Brain;
                  const colorClass = NODE_COLORS[type] || NODE_COLORS.fact;
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-neutral-400" />
                        <h4 className="text-sm font-medium text-neutral-700 capitalize">{type}</h4>
                      </div>
                      <div className="space-y-2">
                        {nodes.map((node: any) => (
                          <div
                            key={node.id}
                            className={`rounded-lg border px-4 py-3 ${colorClass}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{node.label.replace(/_/g, " ")}</p>
                                {node.value && (
                                  <p className="text-xs opacity-70 mt-0.5">{node.value}</p>
                                )}
                              </div>
                              <span className="text-xs opacity-50 flex-shrink-0">
                                {(node.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {graph?.edges?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">Relationships</h4>
                    <div className="space-y-1">
                      {graph.edges.map((e: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-neutral-500">
                          <span className="text-neutral-700">{e.from.replace(/_/g, " ")}</span>
                          <span className="text-neutral-400">—{e.relation.replace(/_/g, " ")}→</span>
                          <span className="text-neutral-700">{e.to.replace(/_/g, " ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
