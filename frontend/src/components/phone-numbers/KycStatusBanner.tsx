"use client";
import { useState } from "react";
import { ShieldCheck, Plus, RefreshCw } from "lucide-react";
import { refreshKycStatus } from "@/lib/api";
import toast from "react-hot-toast";

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
    <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-warning-50 border border-warning-200 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="icon-sm text-warning-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">KYC / Regulatory Compliance</p>
            <p className="text-xs text-neutral-500 mt-0.5">Verify your business identity for countries that require it</p>
          </div>
        </div>
        <div className="relative sm:shrink-0">
          <button
            onClick={() => { setShowAddPicker(v => !v); setAddSearch(""); }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 sm:py-1.5 bg-white hover:bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300 rounded-lg shadow-xs transition-all duration-150"
          >
            <Plus className="icon-xs" />
            Verify another country
          </button>
          {showAddPicker && (
            <div className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-1 z-20 w-auto sm:w-64 bg-white border border-neutral-200 rounded-xl shadow-hover overflow-hidden">
              <div className="p-2 border-b border-neutral-100">
                <input
                  autoFocus
                  value={addSearch}
                  onChange={e => setAddSearch(e.target.value)}
                  placeholder="Search country…"
                  className="input-base text-xs"
                />
              </div>
              <div className="max-h-52 overflow-y-auto scroll-thin">
                {addableCountries.length === 0 ? (
                  <p className="text-xs text-neutral-400 px-3 py-3">No countries found</p>
                ) : addableCountries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => { setShowAddPicker(false); onOpenForm(c.code); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 text-left transition-colors"
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

      <div className="space-y-1">
        {rows.map(({ code, name, bundle, required }) => {
          const status = bundle?.status ?? null;
          const statusStyle =
            status === "approved"  ? "text-success-700 bg-success-50 border-success-200" :
            status === "submitted" ? "text-info-700 bg-info-50 border-info-200" :
            status === "rejected" || status === "failed" ? "text-error-700 bg-error-50 border-error-200" :
            status === "pending"   ? "text-warning-700 bg-warning-50 border-warning-200" :
            "text-neutral-500 bg-neutral-100 border-neutral-200";
          const statusLabel =
            status === "approved"  ? "Approved" :
            status === "submitted" ? "Under Review" :
            status === "rejected"  ? "Rejected" :
            status === "failed"    ? "Failed" :
            status === "pending"   ? "Pending" :
            "Not submitted";

          return (
            <div key={code} className="flex items-start justify-between gap-3 py-3 border-b border-neutral-100 last:border-0">
              {/* Country name + badges below */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-neutral-400 shrink-0">{code}</span>
                  <span className="text-sm text-neutral-800 font-medium">{name}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {required && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning-50 text-warning-600 border border-warning-200">
                      Required
                    </span>
                  )}
                  {/* Only show a status pill once something has actually been submitted */}
                  {status && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusStyle}`}>
                      {statusLabel}
                    </span>
                  )}
                </div>
              </div>
              {/* Action */}
              <div className="flex items-center shrink-0">
                {status === "approved" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-success-600 font-medium">
                    <ShieldCheck className="icon-sm" /> Verified
                  </span>
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
                    className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 bg-info-50 hover:bg-info-100 text-info-700 border border-info-200 rounded-lg transition-colors font-medium"
                  >
                    <RefreshCw className="icon-xs" />
                    Refresh
                  </button>
                ) : (
                  <button
                    onClick={() => onOpenForm(code)}
                    className="text-xs px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors font-medium shadow-xs whitespace-nowrap"
                  >
                    {status === "rejected" || status === "failed" ? "Resubmit" : "Submit KYC"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
        Once KYC shows <span className="font-medium text-success-600">Approved</span>, you can buy numbers for that country. Most submissions are approved instantly.
      </p>
    </div>
  );
}
