"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { X, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { submitKyc } from "@/lib/api";
import toast from "react-hot-toast";
import { FormField, InputField } from "@/components/ui/FormField";

const kycSchema = z.object({
  gstin: z.string().optional().default(""),
  business_name: z.string().min(1, "Business name is required"),
  business_address: z.string().min(1, "Business address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  pincode: z.string().min(1, "Pincode is required"),
  authorized_signatory: z.string().min(1, "Signatory name is required"),
  signatory_designation: z.string().min(1, "Designation is required"),
  documents: z.array(z.any()).min(1, "At least one document is required"),
  agree: z.literal(true).refine(v => v === true, { message: "You must agree to the terms" }),
});

type KycFormValues = z.infer<typeof kycSchema>;

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
  const [businessType, setBusinessType] = useState<"company" | "individual">(existing?.business_type as any ?? "company");
  const [cin, setCin] = useState(existing?.cin ?? "");
  const [authorizedPan, setAuthorizedPan] = useState(existing?.authorized_pan ?? "");
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors }, trigger } = useForm<KycFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(kycSchema) as any,
    defaultValues: {
      gstin: existing?.gstin ?? "",
      business_name: existing?.business_name ?? "",
      business_address: existing?.address_line ?? "",
      city: existing?.city ?? "",
      state: existing?.state ?? "",
      pincode: existing?.postal_code ?? "",
      authorized_signatory: existing?.authorized_name ?? "",
      signatory_designation: "",
      documents: [],
      agree: undefined as any,
    },
  });

  const onSave = handleSubmit(async (data) => {
    setSaving(true);
    try {
      const result = await submitKyc({
        country,
        business_name: data.business_name,
        address_line: data.business_address,
        city: data.city,
        state: data.state,
        postal_code: data.pincode,
        authorized_name: data.authorized_signatory,
        gstin: data.gstin,
        business_type: businessType,
        cin,
        authorized_pan: authorizedPan,
      });
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
  });

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab" && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  useEffect(() => {
    if (dialogRef.current) {
      const first = dialogRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  }, []);

  const inp = "w-full bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500";
  const lbl = "block text-xs text-neutral-500 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
      <div ref={dialogRef} className="bg-white border border-neutral-200 sm:rounded-2xl rounded-t-2xl w-full sm:max-w-lg shadow-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">
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
            <X className="icon-lg" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSave} className="p-5 space-y-4 overflow-y-auto flex-1 font-sans">
          {/* Business type toggle */}
          <div>
            <label className={lbl}>Entity type</label>
            <div className="flex gap-2">
              {(["company", "individual"] as const).map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setBusinessType(t)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    businessType === t
                      ? "bg-brand-500 border-brand-500 text-white"
                      : "bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {t === "company" ? "Company / Business" : "Individual"}
                </button>
              ))}
            </div>
          </div>

          <InputField
            label={businessType === "company" ? "Registered business name" : "Full name"}
            required
            registration={register("business_name")}
            error={errors.business_name}
            placeholder={businessType === "company" ? "Acme Pvt. Ltd." : "Rahul Sharma"}
          />

          {businessType === "company" && country === "IN" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="GSTIN" error={errors.gstin}>
                <input {...register("gstin")} placeholder="22AAAAA0000A1Z5" className={inp} />
              </FormField>
              <div>
                <label className={lbl}>CIN (optional)</label>
                <input value={cin} onChange={e => setCin(e.target.value)}
                  placeholder="U72900MH2020PTC123456" className={inp} />
              </div>
            </div>
          )}

          <InputField
            label="Registered address"
            required
            registration={register("business_address")}
            error={errors.business_address}
            placeholder="123, MG Road, Indiranagar"
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <InputField
                label="City"
                required
                registration={register("city")}
                error={errors.city}
                placeholder="Bengaluru"
              />
            </div>
            <div className="col-span-1">
              <InputField
                label="State"
                required
                registration={register("state")}
                error={errors.state}
                placeholder="Karnataka"
              />
            </div>
            <div className="col-span-1">
              <InputField
                label={country === "IN" ? "PIN code" : "Postal code"}
                required
                registration={register("pincode")}
                error={errors.pincode}
                placeholder="560038"
              />
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-4">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">Authorized Signatory</p>
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Full name"
                required
                registration={register("authorized_signatory")}
                error={errors.authorized_signatory}
                placeholder="Rahul Sharma"
              />
              <InputField
                label="Designation"
                required
                registration={register("signatory_designation")}
                error={errors.signatory_designation}
                placeholder="Director / Manager"
              />
            </div>
            {country === "IN" && (
              <div className="mt-3">
                <label className={lbl}>PAN number</label>
                <input value={authorizedPan} onChange={e => setAuthorizedPan(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F" maxLength={10} className={`${inp} font-mono`} />
              </div>
            )}
          </div>

          {/* Document upload */}
          <div>
            <label className={lbl}>Upload Documents <span className="text-error-400 ml-0.5">*</span></label>
            <input
              type="file"
              multiple
              onChange={e => {
                const files = Array.from(e.target.files || []);
                setDocumentFiles(files);
                setValue("documents", files, { shouldValidate: true });
              }}
              className="w-full bg-neutral-100 border border-neutral-200 text-neutral-900 rounded-xl px-3 py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-xs file:font-medium hover:file:bg-brand-100 focus:outline-none focus:border-brand-500"
            />
            {errors.documents && (
              <p className="text-xs text-error-600 mt-1">{errors.documents.message || errors.documents.root?.message}</p>
            )}
          </div>

          <div className="flex items-start gap-2.5 bg-warning-50 border border-warning-200 rounded-xl px-4 py-3">
            <ShieldAlert className="w-4 h-4 text-warning-500 shrink-0 mt-0.5" />
            <p className="text-xs text-warning-700">
              Your details are used for regulatory compliance. You will not be charged until KYC is approved.
            </p>
          </div>

          {/* Agree checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" {...register("agree")} className="mt-0.5 w-4 h-4 accent-brand-500 rounded" />
            <span className="text-xs text-neutral-600">
              I confirm that the information provided is accurate and agree to the terms of service.
            </span>
          </label>
          {errors.agree && <p className="text-xs text-error-600">{errors.agree.message}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors shadow-xs">
              {saving ? <RefreshCw className="icon-sm animate-spin" /> : <ShieldCheck className="icon-sm" />}
              Submit KYC
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
