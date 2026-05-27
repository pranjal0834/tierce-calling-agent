"use client";
import { Globe, PhoneOff, UserCheck, Info } from "lucide-react";

const TOOL_TYPES = [
  {
    icon: Globe,
    name: "Webhook",
    color: "text-brand-400",
    bg: "bg-brand-500/10",
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
    color: "text-red-400",
    bg: "bg-red-500/10",
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
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
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
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Function Tools</h1>
          <p className="text-gray-400 mt-1">
            Connect your agent to external systems during live calls.
          </p>
        </div>

        {/* Tool type cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOOL_TYPES.map(({ icon: Icon, name, color, bg, description, useCases }) => (
            <div
              key={name}
              className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-5 flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bg}`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <h2 className="font-semibold text-white">{name}</h2>
              </div>

              <p className="text-sm text-gray-400 leading-relaxed">{description}</p>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Use cases
                </p>
                <ul className="space-y-1">
                  {useCases.map((uc) => (
                    <li key={uc} className="flex items-center gap-2 text-xs text-gray-300">
                      <span className={`w-1.5 h-1.5 rounded-full ${bg.replace("/10", "")} flex-shrink-0`} />
                      {uc}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
          <Info className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-brand-300">Tools are configured per-agent</p>
            <p className="text-sm text-gray-400 mt-0.5">
              Go to <span className="text-white font-medium">Agents</span> → select an agent →{" "}
              <span className="text-white font-medium">Tools tab</span> to add and manage tools for
              that agent.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
