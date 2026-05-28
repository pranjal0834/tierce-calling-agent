"use client";
import { useState } from "react";
import { ShieldCheck, Plus, RefreshCw } from "lucide-react";
import { refreshKycStatus } from "@/lib/api";
import toast from "react-hot-toast";

// Countries where KYC is legally required before buying a number
const KYC_REQUIRED = new Set(["IN", "DE", "GB", "AU"]);

// Full country list for KYC submission
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

interface KycStatusBannerProps {
  bundles: KycBundle[];
  onOpenForm: (country: string) => void;
  onBundleUpdated: (b: KycBundle) => void;
}

export function KycStatusBanner({ bundles, onOpenForm, onBundleUpdated }: KycStatusBannerProps) {
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">KYC / Regulatory Compliance</p>
            <p className="text-xs text-gray-500 mt-0.5">Verify your business identity for countries that require it</p>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => { setShowAddPicker(v => !v); setAddSearch(""); }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            Verify another country
          </button>
          {showAddPicker && (
            <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-gray-700">
                <input
                  autoFocus
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Search country…"
                  className="w-full bg-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none placeholder-gray-500"
                />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {addableCountries.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-3">No countries found</p>
                ) : addableCountries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => { setShowAddPicker(false); onOpenForm(c.code); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 text-left transition-colors"
                  >
                    <span className="text-[10px] font-mono text-gray-500 w-7 shrink-0">{c.code}</span>
                    <span className="text-xs text-gray-300">{c.name}</span>
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
            status === "approved"  ? "text-green-400 bg-green-500/10 border-green-500/20" :
            status === "submitted" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
            status === "rejected" || status === "failed" ? "text-red-400 bg-red-500/10 border-red-500/20" :
            status === "pending"   ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
            "text-gray-500 bg-gray-800 border-gray-700";
          const statusLabel =
            status === "approved"  ? "Approved" :
            status === "submitted" ? "Under Review" :
            status === "rejected"  ? "Rejected" :
            status === "failed"    ? "Failed" :
            status === "pending"   ? "Pending" :
            "Not submitted";

          return (
            <div key={code} className="flex items-center justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono text-gray-500 w-6 shrink-0">{code}</span>
                <span className="text-sm text-gray-300">{name}</span>
                {required && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                    Required
                  </span>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {status === "approved" ? (
                  <ShieldCheck className="w-4 h-4 text-green-400" />
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
                    className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-blue-500/20 rounded-lg transition-colors font-medium flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin" />
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

      <p className="text-xs text-gray-600 mt-3">
        Once KYC shows <span className="text-green-500">Approved</span>, you can buy numbers for that country. Most submissions are approved instantly.
      </p>
    </div>
  );
}
