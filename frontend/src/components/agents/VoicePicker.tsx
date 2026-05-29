"use client";

export const VOICES = [
  { id: "alloy",   label: "Alloy",   gender: "Neutral", tone: "Balanced & versatile",    color: "from-violet-400 to-purple-500"  },
  { id: "ash",     label: "Ash",     gender: "Male",    tone: "Confident & direct",       color: "from-slate-400 to-neutral-500"  },
  { id: "ballad",  label: "Ballad",  gender: "Male",    tone: "Warm & storytelling",      color: "from-amber-400 to-orange-500"   },
  { id: "coral",   label: "Coral",   gender: "Female",  tone: "Bright & energetic",       color: "from-rose-400 to-pink-500"      },
  { id: "echo",    label: "Echo",    gender: "Male",    tone: "Clear & professional",     color: "from-cyan-400 to-blue-500"      },
  { id: "sage",    label: "Sage",    gender: "Female",  tone: "Calm & reassuring",        color: "from-emerald-400 to-green-500"  },
  { id: "shimmer", label: "Shimmer", gender: "Female",  tone: "Soft & approachable",      color: "from-sky-400 to-brand-500"      },
  { id: "verse",   label: "Verse",   gender: "Neutral", tone: "Expressive & dynamic",     color: "from-fuchsia-400 to-violet-500" },
];

interface VoicePickerProps {
  value: string;
  onChange: (v: string) => void;
}

export function VoicePicker({ value, onChange }: VoicePickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {VOICES.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={`relative flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 ${
            value === v.id
              ? "border-brand-400 bg-brand-50 shadow-xs"
              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${v.color} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-xs`}>
            {v.label[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-neutral-900">{v.label}</span>
              <span className="text-[10px] text-neutral-400 font-medium">{v.gender}</span>
            </div>
            <p className="text-[11px] text-neutral-500 truncate leading-tight mt-0.5">{v.tone}</p>
          </div>
          {value === v.id && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />
          )}
        </button>
      ))}
    </div>
  );
}
