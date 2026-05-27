import React, { useState } from "react";
import { Phone, Trash2, RefreshCw, CheckCircle, X, Bot, Mic, MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import {
  updateNumberRouting,
  updateNumberAutoRenew,
} from "@/lib/api";
import CapBadge from "@/components/phone-numbers/CapBadge"; // Assuming CapBadge is exported separately; adjust import if needed

interface PhoneNumber {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  provider: string;
  auto_renew: boolean;
  monthly_cost_inr: number;
  capabilities: { voice?: boolean; sms?: boolean };
  agent_id: string | null;
  agent_name: string | null;
}

interface Agent {
  id: string;
  name: string;
}

export default function NumberRow({
  number,
  agents,
  onUpdate,
  onRelease,
}: {
  number: PhoneNumber;
  agents: Agent[];
  onUpdate: (id: string, agentId: string | null, autoRenew?: boolean) => void;
  onRelease: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [agentId, setAgentId] = useState(number.agent_id || "");
  const [saving, setSaving] = useState(false);
  const [autoRenew, setAutoRenew] = useState(number.auto_renew ?? true);
  const [togglingRenew, setTogglingRenew] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateNumberRouting(number.id, agentId || null);
      onUpdate(number.id, agentId || null);
      setEditing(false);
      toast.success("Routing updated");
    } catch {
      toast.error("Failed to update routing");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAutoRenew() {
    const next = !autoRenew;
    setTogglingRenew(true);
    try {
      await updateNumberAutoRenew(number.id, next);
      setAutoRenew(next);
      onUpdate(number.id, number.agent_id, next);
      toast.success(next ? "Auto-renew enabled" : "Auto-renew disabled");
    } catch {
      toast.error("Failed to update auto-renew");
    } finally {
      setTogglingRenew(false);
    }
  }

  const providerLabel = number.provider === "plivo" ? "Plivo" : "Twilio";

  function confirmRelease() {
    if (!confirm(
      `Release ${number.phone_number}?\n\n` +
      `This removes it from your ${providerLabel} account immediately and stops all future charges.`
    )) return;
    onRelease(number.id);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-white font-mono tracking-wide">{number.phone_number}</p>
            {number.friendly_name && (
              <p className="text-xs text-gray-500 mt-0.5">{number.friendly_name}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <CapBadge label="Voice" enabled={number.capabilities?.voice} icon={Mic} />
              <CapBadge label="SMS" enabled={number.capabilities?.sms} icon={MessageSquare} />
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                ₹{number.monthly_cost_inr}/month
              </span>
              <span className="text-xs text-gray-600 capitalize">{providerLabel}</span>
            </div>
          </div>
        </div>

        <button
          onClick={confirmRelease}
          className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
          title="Release number"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Agent routing */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Bot className="w-4 h-4 text-gray-500 shrink-0" />
            {editing ? (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={agentId}
                  onChange={e => setAgentId(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">— No agent —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setAgentId(number.agent_id || ""); }}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              number.agent_name ? (
                <span className="text-white truncate">
                  Routes to <span className="text-indigo-400 font-medium">{number.agent_name}</span>
                </span>
              ) : (
                <span className="text-gray-500">No agent assigned</span>
              )
            )}
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-500 hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-gray-800 shrink-0"
            >
              Change routing
            </button>
          )}
        </div>
      </div>

      {/* Auto-renew toggle */}
      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-400">Auto-renew monthly</p>
          <p className="text-xs text-gray-600 mt-0.5">
            {autoRenew
              ? `₹${number.monthly_cost_inr}/mo will be deducted from your credits automatically`
              : "Renewal is manual — number will stay active until you release it"}
          </p>
        </div>
        <button
          onClick={toggleAutoRenew}
          disabled={togglingRenew}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${autoRenew ? "bg-indigo-600" : "bg-gray-700"} ${togglingRenew ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          title={autoRenew ? "Disable auto-renew" : "Enable auto-renew"}
        >
          <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${autoRenew ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      <p className="text-xs text-gray-700 mt-3 font-mono">
        Purchased {new Date(number.purchased_at + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        &nbsp;·&nbsp;{number.twilio_sid}
      </p>
    </div>
  );
}
