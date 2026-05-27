"use client";
import { useState } from "react";

const LANGUAGE_GROUPS = [
  {
    group: "Indian Languages",
    langs: ["Hindi", "Gujarati", "Marathi", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Odia", "Urdu", "Assamese", "Maithili", "Sindhi", "Sanskrit"],
  },
  {
    group: "English Variants",
    langs: ["English", "British English", "Australian English"],
  },
  {
    group: "European",
    langs: ["Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian", "Polish", "Turkish"],
  },
  {
    group: "Asian",
    langs: ["Mandarin Chinese", "Japanese", "Korean", "Indonesian", "Vietnamese", "Thai", "Malay"],
  },
  {
    group: "Middle Eastern & African",
    langs: ["Arabic", "Persian", "Hebrew", "Swahili"],
  },
];

interface LanguagePickerProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const [search, setSearch] = useState("");
  const toggle = (lang: string) => {
    if (value.includes(lang)) {
      if (value.length === 1) return; // keep at least one
      onChange(value.filter(l => l !== lang));
    } else {
      onChange([...value, lang]);
    }
  };
  const q = search.toLowerCase();
  const filtered = LANGUAGE_GROUPS.map(g => ({
    ...g,
    langs: g.langs.filter(l => l.toLowerCase().includes(q)),
  })).filter(g => g.langs.length > 0);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {value.map(l => (
            <span key={l} className="flex items-center gap-1 bg-brand-500/20 text-brand-300 text-xs px-2 py-1 rounded-full">
              {l}
              {value.length > 1 && (
                <button type="button" onClick={() => toggle(l)} className="text-brand-400 hover:text-white ml-0.5">×</button>
              )}
            </span>
          ))}
          {value.length > 1 && (
            <span className="text-xs text-gray-500 self-center">First selected = primary language</span>
          )}
        </div>
      )}
      <input
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
        placeholder="Search languages..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="max-h-48 overflow-y-auto space-y-3 pr-1">
        {filtered.map(g => (
          <div key={g.group}>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">{g.group}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.langs.map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggle(l)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    value.includes(l)
                      ? "bg-brand-500/20 border-brand-500 text-brand-300"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
