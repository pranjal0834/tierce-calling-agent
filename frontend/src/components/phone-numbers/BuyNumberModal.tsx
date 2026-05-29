"use client";
import { useState } from "react";
import {
  X, RefreshCw, Search, Mic, MessageSquare, Plus, AlertTriangle
} from "lucide-react";
import { searchAvailableNumbers, createNumberPaymentOrder, provisionNumber } from "@/lib/api";
import toast from "react-hot-toast";

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

const TWILIO_COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
];

const PLIVO_COUNTRIES = [
  { code: "IN", name: "India" },
];

interface AvailableNumber {
  phone_number: string;
  friendly_name: string;
  locality: string;
  region: string;
  iso_country: string;
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean };
  monthly_rate_usd?: number;
  restriction_text?: string;
}

interface Agent { id: string; name: string; }

interface BuyNumberModalProps {
  agents: Agent[];
  provider: "twilio" | "plivo" | "exotel";
  onClose: () => void;
  onBought: () => void;
  onNeedKyc?: (country: string) => void;
}

function CapBadge({ label, enabled, icon: Icon }: {
  label: string; enabled?: boolean; icon: React.ElementType;
}) {
  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function BuyNumberModal({ agents, provider, onClose, onBought, onNeedKyc }: BuyNumberModalProps) {
  const countries = provider === "plivo" ? PLIVO_COUNTRIES : TWILIO_COUNTRIES;
  const defaultCountry = provider === "plivo" ? "IN" : "US";

  const [areaCode, setAreaCode] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState(agents[0]?.id || "");

  async function search() {
    setSearching(true);
    setResults([]);
    try {
      const data = await searchAvailableNumbers(areaCode.trim(), country);
      setResults(data.numbers || []);
      if (!data.numbers?.length) toast("No numbers found — try a different area code", { icon: "ℹ️" });
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Search failed — check your provider credentials";
      toast.error(msg, { duration: 6000 });
    } finally {
      setSearching(false);
    }
  }

  async function buy(n: AvailableNumber) {
    const rateUsd = n.monthly_rate_usd ?? 1.0;
    setBuying(n.phone_number);
    try {
      // Check plan / KYC first by creating the order (backend validates these)
      const order = await createNumberPaymentOrder({
        phone_number: n.phone_number,
        monthly_cost_usd: rateUsd,
      });

      // Mock mode — skip Razorpay, provision directly
      if (order.mock) {
        await provisionNumber({
          phone_number: n.phone_number,
          agent_id: selectedAgent || undefined,
          monthly_cost_usd: rateUsd,
        });
        toast.success(`${n.phone_number} added to your workspace (mock)`);
        onBought();
        onClose();
        return;
      }

      // Load Razorpay and collect payment
      const ok = await loadRazorpayScript();
      if (!ok) { toast.error("Could not load Razorpay. Please try again."); setBuying(null); return; }

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.key,
          amount: order.amount,
          currency: "INR",
          name: "Vaaniq Voice",
          description: `First month: ${n.phone_number}`,
          order_id: order.order_id,
          handler: async (response: any) => {
            try {
              await provisionNumber({
                phone_number: n.phone_number,
                agent_id: selectedAgent || undefined,
                monthly_cost_usd: rateUsd,
                razorpay_order_id: order.order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              toast.success(`${n.phone_number} added to your workspace`);
              onBought();
              onClose();
              resolve();
            } catch (e: any) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
          theme: { color: "#6366f1" },
        });
        rzp.open();
      });
    } catch (e: any) {
      if ((e as Error).message === "dismissed") {
        // user closed modal — do nothing
      } else {
        const status = e?.response?.status;
        if (status === 403 && e?.response?.data?.detail === "upgrade_required") {
          toast("Buy a credit pack to unlock dedicated numbers", { icon: "🔒" });
          setTimeout(() => { window.location.href = "/billing"; }, 1500);
        } else if (status === 451 && onNeedKyc) {
          const kycCountry = n.phone_number.startsWith("+91") ? "IN"
            : n.phone_number.startsWith("+49") ? "DE"
            : n.phone_number.startsWith("+44") ? "GB"
            : n.phone_number.startsWith("+61") ? "AU" : "IN";
          toast("KYC required before buying this number", { icon: "🔒" });
          onNeedKyc(kycCountry);
        } else {
          toast.error(e?.response?.data?.detail || (e as Error).message || "Failed to provision number");
        }
      }
    } finally {
      setBuying(null);
    }
  }

  const providerLabel = provider === "plivo" ? "Plivo" : "Twilio";
  const costNote = provider === "plivo"
    ? "First month's rental paid via Razorpay at purchase. Indian numbers ≈ ₹260/mo, others vary."
    : "First month's rental paid via Razorpay at purchase. Twilio rates apply (~₹85–460/mo depending on country).";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl border border-neutral-200 w-full sm:max-w-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Buy Phone Number</h2>
            <p className="text-xs text-neutral-500 mt-0.5">{costNote}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Provider badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Searching via</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
              provider === "plivo"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
            }`}>
              {providerLabel}
            </span>
          </div>

          {/* Search controls */}
          <div className="flex gap-2">
            {/* Only show country dropdown when there are multiple choices */}
            {countries.length > 1 ? (
              <select
                value={country}
                onChange={e => { setCountry(e.target.value); setResults([]); }}
                className="bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
              >
                {countries.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-100 border border-neutral-200 rounded-xl text-sm text-neutral-600 shrink-0">
                <span className="text-xs font-mono text-neutral-500">{countries[0]?.code}</span>
                {countries[0]?.name}
              </div>
            )}
            <input
              value={areaCode}
              onChange={e => setAreaCode(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder={country === "US" ? "Area code (e.g. 415)" : country === "IN" ? "STD code (e.g. 80)" : "Area code (optional)"}
              className="flex-1 bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={search}
              disabled={searching}
              className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2 shadow-xs"
            >
              {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>

          {/* Agent assignment */}
          {agents.length > 0 && (
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">Route inbound calls to</label>
              <select
                value={selectedAgent}
                onChange={e => setSelectedAgent(e.target.value)}
                className="w-full bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
              >
                <option value="">— No agent (unrouted) —</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <p className="text-xs text-neutral-500">{results.length} numbers available</p>
              {results.map(n => {
                const rateUsd = n.monthly_rate_usd ?? 1.0;
                const rateInr = Math.round(rateUsd * 83);
                return (
                  <div key={n.phone_number}
                    className="flex items-center justify-between bg-neutral-100/60 border border-neutral-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 font-mono">{n.phone_number}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {[n.locality, n.region, n.iso_country].filter(Boolean).join(", ")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <CapBadge label="Voice" enabled={n.capabilities?.voice} icon={Mic} />
                        <CapBadge label="SMS" enabled={n.capabilities?.sms} icon={MessageSquare} />
                        <span className="text-xs text-emerald-400 font-medium">
                          ₹{rateInr}/month
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => buy(n)}
                      disabled={!!buying}
                      className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-neutral-900 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      {buying === n.phone_number
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Buying…</>
                        : <><Plus className="w-3.5 h-3.5" />Buy</>
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Cost warning */}
          <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              The first month&apos;s rental is collected via Razorpay at purchase. Renewals are billed every 30 days. Releasing a number stops future charges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
