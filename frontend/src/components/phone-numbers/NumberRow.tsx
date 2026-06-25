import React, { useState } from "react";
import { Phone, Trash2, RefreshCw, CheckCircle, X, Bot, Mic, MessageSquare, AlertTriangle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import {
  updateNumberRouting,
  updateNumberAutoRenew,
  createRenewalOrder,
  renewPhoneNumber,
} from "@/lib/api";
import CapBadge from "@/components/phone-numbers/CapBadge";

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

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
  purchased_at: string;
  twilio_sid: string | null;
  is_suspended?: boolean;
  next_renewal_at?: string | null;
  days_until_renewal?: number | null;
}

interface Agent {
  id: string;
  name: string;
}

// Show the renewal reminder banner within this many days of the due date.
const REMINDER_WINDOW_DAYS = 5;

export default function NumberRow({
  number,
  agents,
  onUpdate,
  onRelease,
  onRenewed,
}: {
  number: PhoneNumber;
  agents: Agent[];
  onUpdate: (id: string, agentId: string | null, autoRenew?: boolean) => void;
  onRelease: (id: string) => void;
  onRenewed?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [agentId, setAgentId] = useState(number.agent_id || "");
  const [saving, setSaving] = useState(false);
  const [autoRenew, setAutoRenew] = useState(number.auto_renew ?? true);
  const [togglingRenew, setTogglingRenew] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const suspended = !!number.is_suspended;
  const daysLeft = number.days_until_renewal;
  const dueSoon = !suspended && daysLeft != null && daysLeft <= REMINDER_WINDOW_DAYS;
  const renewalDateStr = number.next_renewal_at
    ? new Date(number.next_renewal_at + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  async function renew() {
    setRenewing(true);
    try {
      const order = await createRenewalOrder(number.id);
      if (order.mock) {
        await renewPhoneNumber(number.id, {});
        toast.success(`${number.phone_number} renewed`);
        onRenewed?.();
        return;
      }
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Could not load Razorpay. Please try again."); return; }
      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.key,
          amount: order.amount,
          currency: "INR",
          name: "Vaaniq Voice",
          description: `Renewal: ${number.phone_number}`,
          order_id: order.order_id,
          handler: async (response: any) => {
            try {
              await renewPhoneNumber(number.id, {
                razorpay_order_id: order.order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              toast.success(`${number.phone_number} renewed`);
              onRenewed?.();
              resolve();
            } catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
          theme: { color: "#0B8A8F" },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e?.message !== "dismissed") toast.error("Renewal failed");
    } finally {
      setRenewing(false);
    }
  }

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
    <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 bg-brand-500/10 border border-brand-500/25 rounded-xl flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-brand-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-semibold text-neutral-900 font-mono tracking-wide break-all">{number.phone_number}</p>
            {number.friendly_name && (
              <p className="text-xs text-neutral-400 mt-0.5">{number.friendly_name}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <CapBadge label="Voice" enabled={number.capabilities?.voice} icon={Mic} />
              <CapBadge label="SMS" enabled={number.capabilities?.sms} icon={MessageSquare} />
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium">
                ₹{number.monthly_cost_inr}/month
              </span>
              <span className="text-xs text-neutral-400 capitalize">{providerLabel}</span>
              {suspended ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Blocked
                </span>
              ) : dueSoon ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                  <Clock className="w-3 h-3" /> Renews in {daysLeft! <= 0 ? "today" : `${daysLeft}d`}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <button
          onClick={confirmRelease}
          className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
          title="Release number"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Renewal call-to-action — blocked or due soon */}
      {(suspended || dueSoon) && (
        <div className={`mt-3 rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 ${
          suspended ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
        }`}>
          <p className={`text-xs ${suspended ? "text-red-700" : "text-amber-800"}`}>
            {suspended
              ? "Rental expired — this number can't make or receive calls until renewed."
              : `Renews on ${renewalDateStr ?? "soon"} — renew now to avoid any interruption.`}
          </p>
          <button
            onClick={renew}
            disabled={renewing}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
              suspended ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            {renewing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {suspended ? "Renew & reactivate" : "Renew now"} · ₹{number.monthly_cost_inr}
          </button>
        </div>
      )}

      {/* Agent routing */}
      <div className="mt-4 pt-4 border-t border-neutral-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Bot className="w-4 h-4 text-neutral-400 shrink-0" />
            {editing ? (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={agentId}
                  onChange={e => setAgentId(e.target.value)}
                  className="bg-white border border-neutral-300 text-neutral-900 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="">— No agent —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setAgentId(number.agent_id || ""); }}
                  className="text-neutral-400 hover:text-neutral-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              number.agent_name ? (
                <span className="text-neutral-700 truncate">
                  Routes to <span className="text-brand-500 font-medium">{number.agent_name}</span>
                </span>
              ) : (
                <span className="text-neutral-400">No agent assigned</span>
              )
            )}
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-neutral-400 hover:text-brand-500 transition-colors px-2 py-1 rounded-lg hover:bg-neutral-100 shrink-0"
            >
              Change routing
            </button>
          )}
        </div>
      </div>

      {/* Auto-renew toggle */}
      <div className="mt-3 pt-3 border-t border-neutral-200 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-neutral-700">Auto-renew monthly</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {autoRenew
              ? `₹${number.monthly_cost_inr}/mo will be deducted from your number wallet automatically (separate from call credits)`
              : "Renewal is manual — number will stay active until you release it"}
          </p>
        </div>
        <button
          onClick={toggleAutoRenew}
          disabled={togglingRenew}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${autoRenew ? "bg-brand-500" : "bg-neutral-200"} ${togglingRenew ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          title={autoRenew ? "Disable auto-renew" : "Enable auto-renew"}
        >
          <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${autoRenew ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      <p className="text-xs text-neutral-400 mt-3 font-mono break-all">
        Purchased {new Date(number.purchased_at + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        &nbsp;·&nbsp;{number.twilio_sid}
      </p>
    </div>
  );
}
