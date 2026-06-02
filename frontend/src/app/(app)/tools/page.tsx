"use client";
import { Globe, PhoneOff, UserCheck, Info } from "lucide-react";

const TOOL_TYPES = [
  {
    icon: Globe,
    name: "Webhook",
    color: "text-brand-600",
    bg: "bg-brand-50",
    description: "Call any HTTP endpoint during the conversation.",
    useCases: [
      "Appointment booking",
      "CRM updates",
      "Lead capture",
      "Calendar availability checks",
      "Order status lookups",
    ],
  },
  {
    icon: PhoneOff,
    name: "End Call",
    color: "text-red-600",
    bg: "bg-red-50",
    description: "Gracefully end the call when the conversation is complete.",
    useCases: [
      "Caller confirms no further questions",
      "Disqualified leads",
      "Post-booking confirmation",
      "Caller is uninterested",
    ],
  },
  {
    icon: UserCheck,
    name: "Transfer to Human",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Transfer the active call to a human agent via Twilio Dial.",
    useCases: [
      "Caller requests human support",
      "Complex queries beyond AI scope",
      "Escalation workflows",
      "VIP caller handling",
    ],
  },
];

export default function ToolsPage() {
  return (
    <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-neutral-900 tracking-tight">Function Tools</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Connect your agent to external systems during live calls.
          </p>
        </div>

        {/* Tool type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {TOOL_TYPES.map(({ icon: Icon, name, color, bg, description, useCases }) => (
            <div
              key={name}
              className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 sm:p-5 flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h2 className="font-semibold text-neutral-900">{name}</h2>
              </div>

              <p className="text-sm text-neutral-500 leading-relaxed">{description}</p>

              <div>
                <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
                  Use cases
                </p>
                <ul className="space-y-1">
                  {useCases.map((uc) => (
                    <li key={uc} className="flex items-center gap-2 text-xs text-neutral-700">
                      <span className={`w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 ${color}`} />
                      {uc}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-brand-50 border border-brand-200 rounded-xl p-4">
          <Info className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-brand-700">Tools are configured per-agent</p>
            <p className="text-sm text-neutral-500 mt-0.5">
              Go to <span className="text-neutral-900 font-medium">Agents</span> → select an agent →{" "}
              <span className="text-neutral-900 font-medium">Tools tab</span> to add and manage tools for
              that agent.
            </p>
          </div>
        </div>

      </div>
  );
}
