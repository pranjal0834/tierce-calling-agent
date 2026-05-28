"use client";

export const VOICES = [
  { id: "alloy",   label: "Alloy",   gender: "Neutral",  tone: "Balanced & versatile",          color: "from-violet-500 to-purple-600" },
  { id: "ash",     label: "Ash",     gender: "Male",     tone: "Confident & direct",             color: "from-slate-500 to-gray-600" },
  { id: "ballad",  label: "Ballad",  gender: "Male",     tone: "Warm & storytelling",            color: "from-amber-500 to-orange-600" },
  { id: "coral",   label: "Coral",   gender: "Female",   tone: "Bright & energetic",             color: "from-rose-500 to-pink-600" },
  { id: "echo",    label: "Echo",    gender: "Male",     tone: "Clear & professional",           color: "from-cyan-500 to-blue-600" },
  { id: "sage",    label: "Sage",    gender: "Female",   tone: "Calm & reassuring",              color: "from-emerald-500 to-green-600" },
  { id: "shimmer", label: "Shimmer", gender: "Female",   tone: "Soft & approachable",            color: "from-sky-400 to-brand-500" },
  { id: "verse",   label: "Verse",   gender: "Neutral",  tone: "Expressive & dynamic",           color: "from-fuchsia-500 to-violet-600" },
];

interface VoicePickerProps {
  value: string;
  onChange: (v: string) => void;
}

export function VoicePicker({ value, onChange }: VoicePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {VOICES.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          className={`relative flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
            value === v.id
              ? "border-brand-500 bg-brand-500/10"
              : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
          }`}
        >
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${v.color} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold`}>
            {v.label[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-white">{v.label}</span>
              <span className="text-xs text-gray-500">{v.gender}</span>
            </div>
            <p className="text-xs text-gray-400 truncate">{v.tone}</p>
          </div>
          {value === v.id && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500" />
          )}
        </button>
      ))}
    </div>
  );
}
