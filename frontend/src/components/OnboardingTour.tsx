"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, Bot, Phone, PhoneCall, ArrowRight } from "lucide-react";

const STEPS = [
  {
    icon: Bot,
    title: "Create Your First Agent",
    description:
      "Set up an AI voice agent with a custom prompt, voice, and language. Your agent will handle outbound calls and conversations.",
    action: "Create Agent",
    href: "/agents?new=1",
  },
  {
    icon: Phone,
    title: "Get a Phone Number",
    description:
      "Purchase a dedicated phone number so your agent can make and receive calls with a real caller ID.",
    action: "Get Number",
    href: "/phone-numbers",
  },
  {
    icon: PhoneCall,
    title: "Make Your First Call",
    description:
      "Dial a phone number and hear your agent in action. Monitor the call live from the Calls dashboard.",
    action: "Start a Call",
    href: "/calls?dial=1",
  },
];

const ONBOARDING_KEY = "vaaniq_onboarding_done";

export default function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY);
    if (!done) setOpen(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setOpen(false);
  };

  const go = () => {
    router.push(STEPS[step].href);
    dismiss();
  };

  if (!open) return null;

  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[1px]" onClick={dismiss} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md p-6 animate-scale-in">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <X className="icon-sm" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < step
                    ? "bg-brand-500 text-white"
                    : i === step
                      ? "bg-brand-100 text-brand-600 border-2 border-brand-500"
                      : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {i < step ? <CheckCircle2 className="icon-xs" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 rounded ${i < step ? "bg-brand-500" : "bg-neutral-200"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
          <s.icon className="icon-lg text-brand-600" />
        </div>

        {/* Content */}
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">{s.title}</h2>
        <p className="text-sm text-neutral-500 leading-relaxed mb-2">{s.description}</p>
        <p className="text-xs text-neutral-400 mb-6">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={dismiss}
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="h-9 px-4 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={go}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors"
            >
              {s.action} <ArrowRight className="icon-sm" />
            </button>
          </div>
        </div>

        {/* Progress dots */}
        {step < STEPS.length - 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-4 bg-brand-500"
                    : "bg-neutral-300 hover:bg-neutral-400"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
