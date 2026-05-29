"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Phone, Plus, RefreshCw, Search, Bot,
  CheckCircle, X, Mic, MessageSquare, AlertTriangle,
  Settings2, Globe, Eye, EyeOff, ShieldCheck, ShieldAlert,
  Zap, ArrowRight, Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  getPhoneNumbers, searchAvailableNumbers, provisionNumber,
  releasePhoneNumber, getAgents,
  getTelephonyConfig, saveTelephonyConfig,
  getKycBundles, submitKyc, refreshKycStatus,
  getBillingBalance, createNumberPaymentOrder,
} from "@/lib/api";
import CapBadge from "@/components/phone-numbers/CapBadge";
import NumberRow from "@/components/phone-numbers/NumberRow";

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface KycBundle {
  id: string;
  country: string;
  plivo_bundle_sid: string | null;
  status: "pending" | "submitted" | "approved" | "rejected" | "failed";
  business_name: string;
  business_type: string;
  gstin: string | null;
  cin: string | null;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  authorized_name: string;
  authorized_pan: string | null;
  error_message: string | null;
  updated_at: string | null;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  twilio_sid: string;
  provider: string;
  monthly_cost_usd: number;
  monthly_cost_inr: number;
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean };
  agent_id: string | null;
  agent_name: string | null;
  is_active: boolean;
  auto_renew: boolean;
  purchased_at: string;
}

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

// ── Country lists ─────────────────────────────────────────────────────────────

const KYC_REQUIRED = new Set(["IN", "DE", "GB", "AU"]);

const ALL_KYC_COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "CZ", name: "Czech Republic" },
  { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "HR", name: "Croatia" },
  { code: "PH", name: "Philippines" },
  { code: "TH", name: "Thailand" },
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
  { code: "TW", name: "Taiwan" },
  { code: "IL", name: "Israel" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "EG", name: "Egypt" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "AR", name: "Argentina" },
  { code: "PE", name: "Peru" },
];

const ALL_KYC_COUNTRIES_MAP = Object.fromEntries(ALL_KYC_COUNTRIES.map(c => [c.code, c.name]));

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

// ── Telephony Provider Card ────────────────────────────────────────────────────

interface TelephonyConfigState {
  provider: "twilio" | "plivo" | "exotel";
  exotel_api_key: string;
  exotel_api_token: string;
  exotel_account_sid: string;
  exotel_virtual_number: string;
  exotel_subdomain: string;
}

function TelephonyProviderCard({ config, onChange }: {
  config: TelephonyConfigState;
  onChange: (c: TelephonyConfigState) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [local, setLocal] = useState<TelephonyConfigState>(config);

  useEffect(() => { setLocal(config); }, [config]);

  function set(patch: Partial<TelephonyConfigState>) {
    setLocal(prev => ({ ...prev, ...patch }));
  }

  async function save() {
    setSaving(true);
    try {
      await saveTelephonyConfig(local);
      onChange(local);
      toast.success("Telephony provider saved");
    } catch {
      toast.error("Failed to save telephony config");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = JSON.stringify(local) !== JSON.stringify(config);

  return (
    <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-center shrink-0">
          <Settings2 className="w-4 h-4 text-purple-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Telephony Provider</h3>
          <p className="text-xs text-neutral-500">Choose how your calls are placed and received</p>
        </div>
      </div>

      {/* Provider toggle */}
      <div className="flex gap-2 mb-5">
        {(["twilio", "plivo", "exotel"] as const).map(p => (
          <button
            key={p}
            onClick={() => set({ provider: p })}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all ${
              local.provider === p
                ? "bg-brand-500 border-brand-500 text-white"
                : "bg-white border-neutral-300 text-neutral-500 hover:text-neutral-900 hover:border-neutral-400"
            }`}
          >
            {p === "twilio" ? "Twilio" : p === "plivo" ? "Plivo" : "Exotel"}
          </button>
        ))}
      </div>

      {local.provider === "twilio" ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Globe className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-neutral-600 space-y-1">
              <p className="text-neutral-900 font-medium">Using Twilio (global)</p>
              <p>Credentials are loaded from your environment variables (<code className="text-neutral-700">TWILIO_ACCOUNT_SID</code> / <code className="text-neutral-700">TWILIO_AUTH_TOKEN</code>).</p>
              <p>You can buy US, UK, CA, AU, DE, FR, SE and SG numbers directly from this page.</p>
            </div>
          </div>
        </div>
      ) : local.provider === "plivo" ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Globe className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-neutral-600 space-y-1">
              <p className="text-neutral-900 font-medium">Using Plivo (India)</p>
              <p>Platform-managed account — no credentials needed. Best for Indian numbers (+91).</p>
              <p>For US, UK, AU and other international numbers, switch to <span className="text-neutral-800 font-medium">Twilio</span>.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-700">
              Exotel supports Indian numbers (₹). You need an{" "}
              <span className="font-medium text-amber-800">Exotel account</span> and a virtual number.
              Calls and SMS are billed directly by Exotel at their standard rates.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">API Key</label>
              <input
                value={local.exotel_api_key}
                onChange={e => set({ exotel_api_key: e.target.value })}
                placeholder="your_api_key"
                className="w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">API Token</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={local.exotel_api_token}
                  onChange={e => set({ exotel_api_token: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 pr-9 text-sm focus:outline-none focus:border-brand-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">Account SID</label>
              <input
                value={local.exotel_account_sid}
                onChange={e => set({ exotel_account_sid: e.target.value })}
                placeholder="your_account_sid"
                className="w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1.5">Virtual Number (caller ID)</label>
              <input
                value={local.exotel_virtual_number}
                onChange={e => set({ exotel_virtual_number: e.target.value })}
                placeholder="+911234567890"
                className="w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-neutral-500 mb-1.5">API Subdomain</label>
              <input
                value={local.exotel_subdomain}
                onChange={e => set({ exotel_subdomain: e.target.value })}
                placeholder="api.exotel.in"
                className="w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {isDirty && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Save Provider
          </button>
        </div>
      )}
    </div>
  );
}

// ── Buy Number Modal ───────────────────────────────────────────────────────────

function BuyModal({ agents, provider, onClose, onBought, onNeedKyc }: {
  agents: Agent[];
  provider: "twilio" | "plivo" | "exotel";
  onClose: () => void;
  onBought: () => void;
  onNeedKyc?: (country: string) => void;
}) {
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
      const order = await createNumberPaymentOrder({
        phone_number: n.phone_number,
        monthly_cost_usd: rateUsd,
      });

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
        // user closed modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-200">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Buy Phone Number</h2>
            <p className="text-xs text-neutral-500 mt-0.5">{costNote}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Provider badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Searching via</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
              provider === "plivo"
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-blue-50 text-blue-600 border-blue-200"
            }`}>
              {providerLabel}
            </span>
          </div>

          {/* Search controls */}
          <div className="flex gap-2">
            {countries.length > 1 ? (
              <select
                value={country}
                onChange={e => { setCountry(e.target.value); setResults([]); }}
                className="bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
              >
                {countries.map(c => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm text-neutral-700 shrink-0">
                <span className="text-xs font-mono text-neutral-400">{countries[0]?.code}</span>
                {countries[0]?.name}
              </div>
            )}
            <input
              value={areaCode}
              onChange={e => setAreaCode(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder={country === "US" ? "Area code (e.g. 415)" : country === "IN" ? "STD code (e.g. 80)" : "Area code (optional)"}
              className="flex-1 bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={search}
              disabled={searching}
              className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2"
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
                className="w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500"
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
                    className="flex items-center justify-between bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 font-mono">{n.phone_number}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {[n.locality, n.region, n.iso_country].filter(Boolean).join(", ")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <CapBadge label="Voice" enabled={n.capabilities?.voice} icon={Mic} />
                        <CapBadge label="SMS" enabled={n.capabilities?.sms} icon={MessageSquare} />
                        <span className="text-xs text-emerald-600 font-medium">
                          ₹{rateInr}/month
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => buy(n)}
                      disabled={!!buying}
                      className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
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
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              The first month&apos;s rental is collected via Razorpay at purchase. Renewals are billed every 30 days. Releasing a number stops future charges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KYC Status Banner ─────────────────────────────────────────────────────────

function KycStatusBanner({ bundles, onOpenForm, onBundleUpdated }: {
  bundles: KycBundle[];
  onOpenForm: (country: string) => void;
  onBundleUpdated: (b: KycBundle) => void;
}) {
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  const requiredCodes = Array.from(KYC_REQUIRED);
  const extraBundles = bundles.filter(b => !KYC_REQUIRED.has(b.country));
  const rows = [
    ...requiredCodes.map(code => ({
      code,
      name: ALL_KYC_COUNTRIES_MAP[code] ?? code,
      bundle: bundles.find(b => b.country === code) ?? null,
      required: true,
    })),
    ...extraBundles.map(b => ({
      code: b.country,
      name: ALL_KYC_COUNTRIES_MAP[b.country] ?? b.country,
      bundle: b,
      required: false,
    })),
  ];

  const submittedCodes = new Set(bundles.map(b => b.country));
  const addableCountries = ALL_KYC_COUNTRIES.filter(
    c => !submittedCodes.has(c.code) && !KYC_REQUIRED.has(c.code)
  ).filter(c =>
    addSearch.trim() === "" ||
    c.name.toLowerCase().includes(addSearch.toLowerCase()) ||
    c.code.toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">KYC / Regulatory Compliance</p>
            <p className="text-xs text-neutral-500 mt-0.5">Verify your business identity for countries that require it</p>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => { setShowAddPicker(v => !v); setAddSearch(""); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-300 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            Verify another country
          </button>
          {showAddPicker && (
            <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden">
              <div className="p-2 border-b border-neutral-200">
                <input
                  autoFocus
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Search country…"
                  className="w-full bg-neutral-100 text-neutral-900 text-xs rounded-lg px-3 py-2 focus:outline-none placeholder-neutral-400"
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {addableCountries.length === 0 ? (
                  <p className="text-xs text-neutral-500 px-3 py-3">No countries found</p>
                ) : addableCountries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => { setShowAddPicker(false); onOpenForm(c.code); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-100 text-left transition-colors"
                  >
                    <span className="text-[10px] font-mono text-neutral-400 w-7 shrink-0">{c.code}</span>
                    <span className="text-xs text-neutral-700">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map(({ code, name, bundle, required }) => {
          const status = bundle?.status ?? null;
          const statusStyle =
            status === "approved"  ? "text-green-600 bg-green-50 border-green-200" :
            status === "submitted" ? "text-blue-600 bg-blue-50 border-blue-200" :
            status === "rejected" || status === "failed" ? "text-red-600 bg-red-50 border-red-200" :
            status === "pending"   ? "text-yellow-600 bg-yellow-50 border-yellow-200" :
            "text-neutral-500 bg-neutral-100 border-neutral-200";
          const statusLabel =
            status === "approved"  ? "Approved" :
            status === "submitted" ? "Under Review" :
            status === "rejected"  ? "Rejected" :
            status === "failed"    ? "Failed" :
            status === "pending"   ? "Pending" :
            "Not submitted";

          return (
            <div key={code} className="flex items-center justify-between gap-3 py-2 border-b border-neutral-100 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-neutral-400 w-6 shrink-0">{code}</span>
                <span className="text-sm text-neutral-700">{name}</span>
                {required && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                    Required
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {status === "approved" ? (
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                ) : status === "submitted" ? (
                  <button
                    onClick={async () => {
                      if (!bundle) return;
                      try {
                        const updated = await refreshKycStatus(bundle.id);
                        onBundleUpdated(updated);
                        if (updated.status === "approved") toast.success(`${name} KYC approved!`);
                        else toast(`Status: ${updated.status}`, { icon: "ℹ️" });
                      } catch { toast.error("Could not refresh status"); }
                    }}
                    className="text-xs px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded-lg transition-colors font-medium flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                ) : (
                  <button
                    onClick={() => onOpenForm(code)}
                    className="text-xs px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-medium"
                  >
                    {status === "rejected" || status === "failed" ? "Resubmit" : "Submit KYC"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-400 mt-3">
        Once KYC shows <span className="text-green-600 font-medium">Approved</span>, you can buy numbers for that country. Most submissions are approved instantly.
      </p>
    </div>
  );
}

// ── KYC Form Modal ────────────────────────────────────────────────────────────

function KycModal({ country, existing, onClose, onSubmitted }: {
  country: string;
  existing: KycBundle | null;
  onClose: () => void;
  onSubmitted: (b: KycBundle) => void;
}) {
  const countryName = ALL_KYC_COUNTRIES_MAP[country] ?? country;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: existing?.business_name ?? "",
    business_type: existing?.business_type ?? "company",
    gstin: existing?.gstin ?? "",
    cin: existing?.cin ?? "",
    address_line: existing?.address_line ?? "",
    city: existing?.city ?? "",
    state: existing?.state ?? "",
    postal_code: existing?.postal_code ?? "",
    authorized_name: existing?.authorized_name ?? "",
    authorized_pan: existing?.authorized_pan ?? "",
  });

  function set(patch: Partial<typeof form>) { setForm(p => ({ ...p, ...patch })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await submitKyc({ country, ...form });
      if (result.status === "approved") {
        toast.success(`KYC approved — you can now buy ${countryName} numbers`);
      } else {
        toast.success("KYC submitted — Plivo will review within 1–2 business days");
      }
      onSubmitted(result);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "KYC submission failed");
    } finally {
      setSaving(false);
    }
  }

  const inp = "w-full bg-white border border-neutral-300 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500";
  const lbl = "block text-xs text-neutral-500 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">KYC — {countryName}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Required before buying a {countryName} number
              {country === "IN" ? " (TRAI regulation)" : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Business type toggle */}
          <div>
            <label className={lbl}>Entity type</label>
            <div className="flex gap-2">
              {(["company", "individual"] as const).map(t => (
                <button
                  key={t} type="button"
                  onClick={() => set({ business_type: t })}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    form.business_type === t
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "bg-white border-neutral-300 text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {t === "company" ? "Company / Business" : "Individual"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={lbl}>
              {form.business_type === "company" ? "Registered business name" : "Full name"}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <input required value={form.business_name} onChange={e => set({ business_name: e.target.value })}
              placeholder={form.business_type === "company" ? "Acme Pvt. Ltd." : "Rahul Sharma"}
              className={inp} />
          </div>

          {form.business_type === "company" && country === "IN" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>GSTIN</label>
                <input value={form.gstin} onChange={e => set({ gstin: e.target.value })}
                  placeholder="22AAAAA0000A1Z5" className={inp} />
              </div>
              <div>
                <label className={lbl}>CIN (optional)</label>
                <input value={form.cin} onChange={e => set({ cin: e.target.value })}
                  placeholder="U72900MH2020PTC123456" className={inp} />
              </div>
            </div>
          )}

          <div>
            <label className={lbl}>Registered address<span className="text-red-500 ml-0.5">*</span></label>
            <input required value={form.address_line} onChange={e => set({ address_line: e.target.value })}
              placeholder="123, MG Road, Indiranagar" className={inp} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={lbl}>City<span className="text-red-500 ml-0.5">*</span></label>
              <input required value={form.city} onChange={e => set({ city: e.target.value })}
                placeholder="Bengaluru" className={inp} />
            </div>
            <div className="col-span-1">
              <label className={lbl}>State<span className="text-red-500 ml-0.5">*</span></label>
              <input required value={form.state} onChange={e => set({ state: e.target.value })}
                placeholder="Karnataka" className={inp} />
            </div>
            <div className="col-span-1">
              <label className={lbl}>{country === "IN" ? "PIN code" : "Postal code"}<span className="text-red-500 ml-0.5">*</span></label>
              <input required value={form.postal_code} onChange={e => set({ postal_code: e.target.value })}
                placeholder="560038" className={inp} />
            </div>
          </div>

          <div className="border-t border-neutral-200 pt-4">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Authorized Signatory</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Full name<span className="text-red-500 ml-0.5">*</span></label>
                <input required value={form.authorized_name} onChange={e => set({ authorized_name: e.target.value })}
                  placeholder="Rahul Sharma" className={inp} />
              </div>
              {country === "IN" && (
                <div>
                  <label className={lbl}>PAN number</label>
                  <input value={form.authorized_pan} onChange={e => set({ authorized_pan: e.target.value.toUpperCase() })}
                    placeholder="ABCDE1234F" maxLength={10} className={`${inp} font-mono`} />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              Your details are used for regulatory compliance. You will not be charged until KYC is approved.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Submit KYC
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Trial Banner ─────────────────────────────────────────────────────────────

function TrialBanner() {
  return (
    <div className="bg-gradient-to-r from-brand-500/15 via-purple-600/10 to-brand-500/15 border border-brand-500/25 rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-brand-500/15 border border-brand-500/25 rounded-xl flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-brand-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-neutral-900">You&apos;re on the Free Plan</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-600 border border-brand-500/25 uppercase tracking-wide">
              Trial
            </span>
          </div>
          <p className="text-xs text-neutral-600 leading-relaxed mb-3">
            Your AI agents can already make outbound calls using <span className="text-neutral-800 font-medium">Vaaniq&apos;s shared platform number</span>.
            To get a dedicated number for inbound calls and branded caller ID, upgrade to any paid plan.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-4 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Outbound calls work now
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-neutral-400" />
                Inbound requires own number
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-neutral-400" />
                Branded caller ID requires own number
              </span>
            </div>
            <a
              href="/billing"
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-xl transition-colors shrink-0"
            >
              <Zap className="w-3.5 h-3.5" />
              Buy a pack to unlock
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: TelephonyConfigState = {
  provider: "twilio",
  exotel_api_key: "",
  exotel_api_token: "",
  exotel_account_sid: "",
  exotel_virtual_number: "",
  exotel_subdomain: "api.exotel.in",
};

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuy, setShowBuy] = useState(false);
  const [providerConfig, setProviderConfig] = useState<TelephonyConfigState>(DEFAULT_CONFIG);
  const [kycBundles, setKycBundles] = useState<KycBundle[]>([]);
  const [kycCountry, setKycCountry] = useState<string | null>(null);
  const [workspacePlan, setWorkspacePlan] = useState("free");

  const isTrial = workspacePlan === "free";

  const load = useCallback(async () => {
    try {
      const [nums, ags, cfg, kyc, billing] = await Promise.all([
        getPhoneNumbers(), getAgents(), getTelephonyConfig(), getKycBundles(), getBillingBalance(),
      ]);
      setNumbers(nums);
      setAgents(ags);
      if (cfg) setProviderConfig({ ...DEFAULT_CONFIG, ...cfg });
      if (Array.isArray(kyc)) setKycBundles(kyc);
      if (billing) setWorkspacePlan(billing.plan ?? "free");
    } catch {
      toast.error("Failed to load phone numbers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRelease(id: string) {
    try {
      await releasePhoneNumber(id);
      setNumbers(n => n.filter(x => x.id !== id));
      toast.success("Number released");
    } catch {
      toast.error("Failed to release number");
    }
  }

  function handleUpdate(id: string, agentId: string | null, autoRenew?: boolean) {
    const agent = agents.find(a => a.id === agentId);
    setNumbers(nums => nums.map(n =>
      n.id === id ? {
        ...n,
        agent_id: agentId,
        agent_name: agent?.name || null,
        ...(autoRenew !== undefined ? { auto_renew: autoRenew } : {}),
      } : n
    ));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">Phone Numbers</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Buy dedicated numbers for inbound calls and branded outbound caller ID</p>
        </div>
        {isTrial ? (
          <a
            href="/billing"
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Zap className="w-4 h-4" />
            Upgrade to Buy Numbers
          </a>
        ) : (
          <button
            onClick={() => setShowBuy(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Buy Number
          </button>
        )}
      </div>

      {/* Trial banner */}
      {isTrial && <TrialBanner />}

      {/* Feature overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4">
          <div className="w-7 h-7 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-center mb-3">
            <Phone className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <p className="text-sm font-semibold text-neutral-900 mb-1">Inbound Calls</p>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Someone calls your number → Vaaniq instantly routes it to the assigned AI agent. No human needed.
          </p>
        </div>
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4">
          <div className="w-7 h-7 bg-brand-500/10 border border-brand-500/25 rounded-lg flex items-center justify-center mb-3">
            <Bot className="w-3.5 h-3.5 text-brand-500" />
          </div>
          <p className="text-sm font-semibold text-neutral-900 mb-1">Outbound Caller ID</p>
          <p className="text-xs text-neutral-500 leading-relaxed">
            When your agent calls out, your dedicated number appears as the caller ID instead of an unknown number.
          </p>
        </div>
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4">
          <div className="w-7 h-7 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center mb-3">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-neutral-900 mb-1">Simple Billing</p>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Pay the first month's rental directly via Razorpay when you buy. Renewals are handled monthly from your account.
          </p>
        </div>
      </div>

      {/* Step 1 — Provider */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 bg-brand-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0">1</span>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Choose your telephony provider</p>
        </div>
        <TelephonyProviderCard config={providerConfig} onChange={setProviderConfig} />
      </div>

      {/* KYC */}
      {providerConfig.provider !== "exotel" && (
        <KycStatusBanner
          bundles={kycBundles}
          onOpenForm={(country: string) => setKycCountry(country)}
          onBundleUpdated={(b: KycBundle) => setKycBundles((prev: KycBundle[]) => {
            const without = prev.filter((x: KycBundle) => x.country !== b.country);
            return [...without, b];
          })}
        />
      )}

      {/* Step 2 — Numbers */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-5 h-5 bg-brand-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0">2</span>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Buy numbers &amp; assign agents</p>
        </div>

        {/* Inbound routing explainer */}
        <div className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">How inbound routing works</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { n: "1", label: "Caller dials your number", color: "text-blue-600 bg-blue-50 border-blue-200" },
              { n: "→", label: "", color: "" },
              { n: "2", label: "Vaaniq matches it to your agent", color: "text-brand-600 bg-brand-500/8 border-brand-500/25" },
              { n: "→", label: "", color: "" },
              { n: "3", label: "AI agent answers in real-time", color: "text-green-600 bg-green-50 border-green-200" },
            ].map((item, i) =>
              item.n === "→" ? (
                <span key={i} className="text-neutral-400 text-base shrink-0">→</span>
              ) : (
                <div key={i} className={`shrink-0 rounded-xl px-3 py-2 border ${item.color} text-center min-w-[130px]`}>
                  <p className="text-[10px] font-semibold opacity-60 mb-0.5">Step {item.n}</p>
                  <p className="text-xs font-medium">{item.label}</p>
                </div>
              )
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-200 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-500">
              Each number can only route to <span className="text-neutral-800 font-medium">one agent</span>. You can change the routing at any time from the list below.
              If no agent is assigned, inbound calls will not be answered.
            </p>
          </div>
        </div>

        {/* Numbers list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-neutral-500">Loading…</span>
          </div>
        ) : numbers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed border-neutral-300 rounded-2xl">
            <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
              <Phone className="w-7 h-7 text-neutral-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-700">No phone numbers yet</p>
              <p className="text-xs text-neutral-400 mt-1">
                {providerConfig.provider === "exotel"
                  ? "Exotel numbers are managed in your Exotel dashboard — enter your credentials above to get started"
                  : "Search for an available number above and buy it with one click"}
              </p>
            </div>
            {providerConfig.provider !== "exotel" && (
              isTrial ? (
                <a
                  href="/billing"
                  className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  Upgrade to buy a number
                </a>
              ) : (
                <button
                  onClick={() => setShowBuy(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Buy your first number
                </button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {numbers.map(n => (
              <NumberRow
                key={n.id}
                number={n}
                agents={agents}
                onUpdate={handleUpdate}
                onRelease={handleRelease}
              />
            ))}
          </div>
        )}
      </div>

      {showBuy && (
        <BuyModal
          agents={agents}
          provider={providerConfig.provider}
          onClose={() => setShowBuy(false)}
          onBought={load}
          onNeedKyc={(country) => { setShowBuy(false); setKycCountry(country); }}
        />
      )}

      {kycCountry && (
        <KycModal
          country={kycCountry}
          existing={kycBundles.find(b => b.country === kycCountry) ?? null}
          onClose={() => setKycCountry(null)}
          onSubmitted={(bundle) => {
            setKycBundles(prev => {
              const without = prev.filter(b => b.country !== bundle.country);
              return [...without, bundle];
            });
          }}
        />
      )}
    </div>
  );
}
