"use client";
import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { acceptTerms } from "@/lib/api";

/**
 * First-login Terms of Service gate. Shown (and not dismissable) whenever the
 * user has not accepted the current terms version. Replace TERMS_SECTIONS below
 * with your finalized legal copy — bump TERMS_VERSION in backend/config.py to
 * force everyone to re-accept after an update.
 */
const TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "1. Acceptance of Terms",
    body: "By accessing or using Vaaniq Voice (the “Platform”), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, you may not use the Platform.",
  },
  {
    heading: "2. Acceptable Use & Calling Consent",
    body: "You are solely responsible for ensuring you have a lawful basis (valid consent or an existing business relationship) to contact any individual you call through the Platform. You must comply with all applicable telecom and data-protection laws, including TRAI/DLT regulations, honor Do-Not-Call requests and opt-outs, and only call within permitted hours.",
  },
  {
    heading: "3. Prohibited Activities",
    body: "You may not use the Platform for spam, fraud, harassment, illegal solicitation, or to transmit unlawful, deceptive, or harmful content. We may suspend accounts that generate excessive opt-outs or violate carrier or regulatory policies.",
  },
  {
    heading: "4. Call Recording & Data",
    body: "Calls may be recorded, transcribed, and analyzed to operate and improve the service. You are responsible for providing any disclosures to callers that the law requires. You retain ownership of your data; we process it to provide the service as described in the Privacy Policy.",
  },
  {
    heading: "5. Billing",
    body: "Call minutes and phone-number rental are charged as shown in your plan. Credits are deducted by actual call duration. Number rental is billed monthly from your number wallet. Payments are processed via Razorpay and applicable taxes (including GST) apply.",
  },
  {
    heading: "6. Service Availability & Liability",
    body: "The Platform is provided “as is” without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect or consequential damages, or for outcomes of calls made through your agents.",
  },
  {
    heading: "7. Changes",
    body: "We may update these terms. When we do, you will be asked to review and accept the updated version before continuing to use the Platform.",
  },
];

export default function TermsModal({ onAccepted }: { onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  async function accept() {
    if (!checked) return;
    setSaving(true);
    try {
      await acceptTerms();
      onAccepted();
    } catch {
      toast.error("Could not save your acceptance. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-neutral-100">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-50 text-brand-600 shrink-0"><ShieldCheck className="w-5 h-5" /></span>
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Terms of Service</h2>
            <p className="text-xs text-neutral-500">Please review and accept to continue.</p>
          </div>
        </div>

        {/* Scrollable terms */}
        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {TERMS_SECTIONS.map((s) => (
            <div key={s.heading}>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1">{s.heading}</h3>
              <p className="text-[13px] leading-6 text-neutral-600">{s.body}</p>
            </div>
          ))}
          <p className="text-[12px] text-neutral-400 pt-2">
            Full <a href="/docs/compliance" className="underline">compliance guidance</a> is available in our documentation.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-100 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-brand-600 rounded shrink-0"
            />
            <span className="text-[13px] leading-5 text-neutral-700">
              I have read and agree to the <span className="font-semibold">Terms of Service</span> and <span className="font-semibold">Privacy Policy</span>.
            </span>
          </label>
          <button
            onClick={accept}
            disabled={!checked || saving}
            className="w-full h-10 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Agree & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
