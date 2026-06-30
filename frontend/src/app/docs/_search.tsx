"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FLAT_PAGES } from "./content";

export default function DocsSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = q.trim()
    ? FLAT_PAGES.filter((p) => (p.title + " " + p.section).toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(slug: string) {
    router.push(`/docs/${slug}`);
    setQ(""); setOpen(false);
  }

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 h-9 focus-within:border-brand-300 focus-within:bg-white transition-colors">
        <Search className="w-4 h-4 text-neutral-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && results[hi]) go(results[hi].slug);
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search docs…"
          className="w-full bg-transparent text-sm text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden py-1">
          {results.map((r, i) => (
            <button
              key={r.slug}
              onMouseEnter={() => setHi(i)}
              onClick={() => go(r.slug)}
              className={`w-full text-left px-3 py-2 ${i === hi ? "bg-brand-50" : ""}`}
            >
              <div className="text-sm text-neutral-800">{r.title}</div>
              <div className="text-[11px] text-neutral-400">{r.section}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
