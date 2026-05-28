// src/hooks/useLanguagePicker.ts
"use client";
import { useState } from "react";

export type LanguageGroup = {
  group: string;
  langs: string[];
};

export const LANGUAGE_GROUPS: LanguageGroup[] = [
  {
    group: "Indian Languages",
    langs: ["Hindi", "Gujarati", "Marathi", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Odia", "Urdu", "Assamese", "Maithili", "Sindhi", "Sanskrit"],
  },
  { group: "English Variants", langs: ["English", "British English", "Australian English"] },
  { group: "European", langs: ["Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian", "Polish", "Turkish"] },
  { group: "Asian", langs: ["Mandarin Chinese", "Japanese", "Korean", "Indonesian", "Vietnamese", "Thai", "Malay"] },
  { group: "Middle Eastern & African", langs: ["Arabic", "Persian", "Hebrew", "Swahili"] },
];

export function useLanguagePicker(initial: string[] = []) {
  const [value, setValue] = useState<string[]>(initial);
  const [search, setSearch] = useState("");

  const toggle = (lang: string) => {
    if (value.includes(lang)) {
      if (value.length === 1) return; // keep at least one
      setValue(value.filter(l => l !== lang));
    } else {
      setValue([...value, lang]);
    }
  };

  const filtered = LANGUAGE_GROUPS.map(g => ({
    ...g,
    langs: g.langs.filter(l => l.toLowerCase().includes(search.toLowerCase())),
  })).filter(g => g.langs.length > 0);

  return {
    value,
    setValue,
    search,
    setSearch,
    toggle,
    filtered,
  };
}
