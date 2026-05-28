// src/components/agents/LanguagePicker.tsx
"use client";
import Card from "@/components/ui/Card";
import Pill from "@/components/ui/Pill";
import Button from "@/components/ui/Button";
import { useLanguagePicker } from "@/hooks/useLanguagePicker";

interface LanguagePickerProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  // Use the custom hook to manage search and toggle logic
  const { search, setSearch, filtered } = useLanguagePicker(value);

  // Keep parent component in sync when toggling selections
  const handleToggle = (lang: string) => {
    // Compute new selection based on current prop `value`
    let newValue = [...value];
    if (newValue.includes(lang)) {
      if (newValue.length === 1) return; // keep at least one selected
      newValue = newValue.filter(l => l !== lang);
    } else {
      newValue.push(lang);
    }
    onChange(newValue);
  };

  return (
    <Card className="space-y-2 bg-white p-4 rounded-lg border border-gray-200">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {value.map(l => (
            <Pill
              key={l}
              selected={true}
              onRemove={value.length > 1 ? () => handleToggle(l) : undefined}
            >
              {l}
            </Pill>
          ))}
          {value.length > 1 && (
            <span className="text-xs text-gray-500 self-center">
              First selected = primary language
            </span>
          )}
        </div>
      )}
      <input
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
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
                <Button
                  key={l}
                  variant={value.includes(l) ? "primary" : "secondary"}
                  className="text-xs"
                  onClick={() => handleToggle(l)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
