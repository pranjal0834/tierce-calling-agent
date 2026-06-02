"use client";
import { useState } from "react";
import { X, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { submitKyc } from "@/lib/api";
import toast from "react-hot-toast";

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

interface KycFormModalProps {
  country: string;
  existing: KycBundle | null;
  onClose: () => void;
  onSubmitted: (b: KycBundle) => void;
}

export function KycFormModal({ country, existing, onClose, onSubmitted }: KycFormModalProps) {
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

  const inp = "w-full bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500";
  const lbl = "block text-xs text-neutral-500 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div className="bg-white border border-neutral-200 sm:rounded-2xl rounded-t-2xl w-full sm:max-w-lg shadow-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">KYC — {countryName}</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Required before buying a {countryName} number
              {country === "IN" ? " (TRAI regulation)" : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto flex-1 font-sans">
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
                      : "bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-900"
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
              <span className="text-red-400 ml-0.5">*</span>
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
            <label className={lbl}>Registered address<span className="text-red-400 ml-0.5">*</span></label>
            <input required value={form.address_line} onChange={e => set({ address_line: e.target.value })}
              placeholder="123, MG Road, Indiranagar" className={inp} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className={lbl}>City<span className="text-red-400 ml-0.5">*</span></label>
              <input required value={form.city} onChange={e => set({ city: e.target.value })}
                placeholder="Bengaluru" className={inp} />
            </div>
            <div className="col-span-1">
              <label className={lbl}>State<span className="text-red-400 ml-0.5">*</span></label>
              <input required value={form.state} onChange={e => set({ state: e.target.value })}
                placeholder="Karnataka" className={inp} />
            </div>
            <div className="col-span-1">
              <label className={lbl}>{country === "IN" ? "PIN code" : "Postal code"}<span className="text-red-400 ml-0.5">*</span></label>
              <input required value={form.postal_code} onChange={e => set({ postal_code: e.target.value })}
                placeholder="560038" className={inp} />
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Authorized Signatory</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Full name<span className="text-red-400 ml-0.5">*</span></label>
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
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
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
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors shadow-xs">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Submit KYC
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
