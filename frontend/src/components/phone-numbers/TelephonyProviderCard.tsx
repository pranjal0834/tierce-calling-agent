"use client";
import { useEffect, useState } from "react";
import { Settings2, Globe, EyeOff, Eye, RefreshCw, CheckCircle } from "lucide-react";
import { saveTelephonyConfig } from "@/lib/api";
import toast from "react-hot-toast";

interface TelephonyConfigState {
  provider: "twilio" | "plivo" | "exotel";
  exotel_api_key: string;
  exotel_api_token: string;
  exotel_account_sid: string;
  exotel_virtual_number: string;
  exotel_subdomain: string;
}

interface TelephonyProviderCardProps {
  config: TelephonyConfigState;
  onChange: (c: TelephonyConfigState) => void;
}

export function TelephonyProviderCard({ config, onChange }: TelephonyProviderCardProps) {
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-purple-600/20 border border-purple-500/30 rounded-lg flex items-center justify-center shrink-0">
          <Settings2 className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Telephony Provider</h3>
          <p className="text-xs text-gray-500">Choose how your calls are placed and received</p>
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
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {p === "twilio" ? "Twilio" : p === "plivo" ? "Plivo" : "Exotel"}
          </button>
        ))}
      </div>

      {local.provider === "twilio" ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Globe className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400 space-y-1">
              <p className="text-gray-300 font-medium">Using Twilio (global)</p>
              <p>Credentials are loaded from your environment variables (<code className="text-gray-300">TWILIO_ACCOUNT_SID</code> / <code className="text-gray-300">TWILIO_AUTH_TOKEN</code>).</p>
              <p>You can buy US, UK, CA, AU, DE, FR, SE and SG numbers directly from this page.</p>
            </div>
          </div>
        </div>
      ) : local.provider === "plivo" ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400 space-y-1">
              <p className="text-gray-300 font-medium">Using Plivo (India)</p>
              <p>Platform-managed account — no credentials needed. Best for Indian numbers (+91).</p>
              <p>For US, UK, AU and other international numbers, switch to <span className="text-gray-300 font-medium">Twilio</span>.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <p className="text-xs text-amber-300">
              Exotel supports Indian numbers (₹). You need an{" "}
              <span className="font-medium text-amber-200">Exotel account</span> and a virtual number.
              Calls and SMS are billed directly by Exotel at their standard rates.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">API Key</label>
              <input
                value={local.exotel_api_key}
                onChange={e => set({ exotel_api_key: e.target.value })}
                placeholder="your_api_key"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">API Token</label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={local.exotel_api_token}
                  onChange={e => set({ exotel_api_token: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 pr-9 text-sm focus:outline-none focus:border-brand-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Account SID</label>
              <input
                value={local.exotel_account_sid}
                onChange={e => set({ exotel_account_sid: e.target.value })}
                placeholder="your_account_sid"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Virtual Number (caller ID)</label>
              <input
                value={local.exotel_virtual_number}
                onChange={e => set({ exotel_virtual_number: e.target.value })}
                placeholder="+911234567890"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1.5">API Subdomain</label>
              <input
                value={local.exotel_subdomain}
                onChange={e => set({ exotel_subdomain: e.target.value })}
                placeholder="api.exotel.in"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500 font-mono"
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
