"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

// All 30 Gemini Live native-audio prebuilt voices (the engine all calls now run
// on). The `id` is the exact Gemini voice name sent to the model — no remapping.
// The first 8 are recommended picks; the rest give finer tone/character choice.
// Note: "gender" is an approximate perceived label — Google doesn't officially
// assign genders, so trust your ear on a test call over this tag.
export const VOICES = [
  // ── Recommended ───────────────────────────────────────────────────────────
  { id: "Aoede",         label: "Aoede",         gender: "Female", tone: "Breezy & natural",        color: "from-rose-400 to-pink-500"      },
  { id: "Kore",          label: "Kore",          gender: "Female", tone: "Firm & professional",     color: "from-violet-400 to-purple-500"  },
  { id: "Leda",          label: "Leda",          gender: "Female", tone: "Youthful & warm",         color: "from-sky-400 to-brand-500"      },
  { id: "Callirrhoe",    label: "Callirrhoe",    gender: "Female", tone: "Easy-going & relaxed",    color: "from-emerald-400 to-green-500"  },
  { id: "Puck",          label: "Puck",          gender: "Male",   tone: "Upbeat & energetic",      color: "from-amber-400 to-orange-500"   },
  { id: "Charon",        label: "Charon",        gender: "Male",   tone: "Informative & deep",      color: "from-cyan-400 to-blue-500"      },
  { id: "Fenrir",        label: "Fenrir",        gender: "Male",   tone: "Excitable & dynamic",     color: "from-fuchsia-400 to-violet-500" },
  { id: "Orus",          label: "Orus",          gender: "Male",   tone: "Firm & assured",          color: "from-slate-400 to-neutral-500"  },
  // ── More female-leaning ───────────────────────────────────────────────────
  { id: "Zephyr",        label: "Zephyr",        gender: "Female", tone: "Bright & clear",          color: "from-sky-400 to-brand-500"      },
  { id: "Autonoe",       label: "Autonoe",       gender: "Female", tone: "Bright & lively",         color: "from-rose-400 to-pink-500"      },
  { id: "Despina",       label: "Despina",       gender: "Female", tone: "Smooth & polished",       color: "from-violet-400 to-purple-500"  },
  { id: "Erinome",       label: "Erinome",       gender: "Female", tone: "Clear & crisp",           color: "from-cyan-400 to-blue-500"      },
  { id: "Achernar",      label: "Achernar",      gender: "Female", tone: "Soft & gentle",           color: "from-emerald-400 to-green-500"  },
  { id: "Gacrux",        label: "Gacrux",        gender: "Female", tone: "Mature & steady",         color: "from-amber-400 to-orange-500"   },
  { id: "Pulcherrima",   label: "Pulcherrima",   gender: "Female", tone: "Forward & expressive",    color: "from-fuchsia-400 to-violet-500" },
  { id: "Vindemiatrix",  label: "Vindemiatrix",  gender: "Female", tone: "Gentle & calm",           color: "from-sky-400 to-brand-500"      },
  { id: "Sulafat",       label: "Sulafat",       gender: "Female", tone: "Warm & inviting",         color: "from-rose-400 to-pink-500"      },
  { id: "Laomedeia",     label: "Laomedeia",     gender: "Female", tone: "Upbeat & cheerful",       color: "from-amber-400 to-orange-500"   },
  // ── More male-leaning ─────────────────────────────────────────────────────
  { id: "Sadachbia",     label: "Sadachbia",     gender: "Male",   tone: "Lively & spirited",       color: "from-fuchsia-400 to-violet-500" },
  { id: "Enceladus",     label: "Enceladus",     gender: "Male",   tone: "Breathy & relaxed",       color: "from-slate-400 to-neutral-500"  },
  { id: "Iapetus",       label: "Iapetus",       gender: "Male",   tone: "Clear & articulate",      color: "from-cyan-400 to-blue-500"      },
  { id: "Umbriel",       label: "Umbriel",       gender: "Male",   tone: "Easy-going & calm",       color: "from-emerald-400 to-green-500"  },
  { id: "Algieba",       label: "Algieba",       gender: "Male",   tone: "Smooth & mellow",         color: "from-violet-400 to-purple-500"  },
  { id: "Algenib",       label: "Algenib",       gender: "Male",   tone: "Gravelly & textured",     color: "from-slate-400 to-neutral-500"  },
  { id: "Rasalgethi",    label: "Rasalgethi",    gender: "Male",   tone: "Informative & measured",  color: "from-cyan-400 to-blue-500"      },
  { id: "Alnilam",       label: "Alnilam",       gender: "Male",   tone: "Firm & steady",           color: "from-slate-400 to-neutral-500"  },
  { id: "Schedar",       label: "Schedar",       gender: "Male",   tone: "Even & balanced",         color: "from-violet-400 to-purple-500"  },
  { id: "Achird",        label: "Achird",        gender: "Male",   tone: "Friendly & approachable", color: "from-amber-400 to-orange-500"   },
  { id: "Zubenelgenubi", label: "Zubenelgenubi", gender: "Male",   tone: "Casual & conversational", color: "from-emerald-400 to-green-500"  },
  { id: "Sadaltager",    label: "Sadaltager",    gender: "Male",   tone: "Knowledgeable & assured", color: "from-cyan-400 to-blue-500"      },
];

interface VoicePickerProps {
  value: string;
  onChange: (v: string) => void;
}

// Backend base URL (samples are served at <BASE>/voice-samples/<Voice>.<lang>.wav).
const API_BASE = (process.env.NEXT_PUBLIC_API_URL as string) || "http://localhost:8000";

// Languages the preview can be auditioned in (one short clip each).
const PREVIEW_LANGS = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
  { code: "gu", label: "ગુજરાતી" },
];

export function VoicePicker({ value, onChange }: VoicePickerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Voice id whose sample is currently loading or playing.
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  // Which language the preview button plays.
  const [lang, setLang] = useState("en");

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setActive(null);
    setLoading(null);
  };

  // Stop playback if the picker unmounts (e.g. modal closes).
  useEffect(() => () => stopAudio(), []);

  const togglePreview = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (active === id) { stopAudio(); return; }
    stopAudio();
    const audio = new Audio(`${API_BASE}/voice-samples/${id}.${lang}.wav`);
    audioRef.current = audio;
    setLoading(id);
    audio.onplaying = () => { setLoading(null); setActive(id); };
    audio.onended = stopAudio;
    audio.onerror = () => { stopAudio(); toast.error("Couldn't load voice sample"); };
    audio.play().catch(() => stopAudio());
  };

  return (
    <div className="space-y-2.5">
      {/* Preview-language toggle — pick a language, then ▶ a voice to hear it in that language */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-neutral-400 font-medium">Preview in</span>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
          {PREVIEW_LANGS.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => { if (l.code !== lang) { stopAudio(); setLang(l.code); } }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                lang === l.code
                  ? "bg-white text-brand-600 shadow-xs"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {VOICES.map(v => {
        const selected = value === v.id;
        const isActive = active === v.id;
        const isLoading = loading === v.id;
        return (
          <div
            key={v.id}
            role="button"
            tabIndex={0}
            onClick={() => onChange(v.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(v.id); } }}
            className={`relative flex items-center gap-2.5 p-3 pr-11 rounded-xl border text-left cursor-pointer transition-all duration-150 ${
              selected
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

            {/* Play / preview button */}
            <button
              type="button"
              aria-label={isActive ? `Stop ${v.label} sample` : `Play ${v.label} sample`}
              onClick={(e) => togglePreview(e, v.id)}
              className={`absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                isActive
                  ? "bg-brand-500 text-white"
                  : "bg-neutral-100 text-neutral-500 hover:bg-brand-100 hover:text-brand-600"
              }`}
            >
              {isLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : isActive
                  ? <Pause className="w-3.5 h-3.5" />
                  : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
          </div>
        );
      })}
      </div>
    </div>
  );
}
