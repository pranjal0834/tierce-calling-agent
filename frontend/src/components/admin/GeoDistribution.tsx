"use client";
import { useEffect, useState } from "react";
import { Globe, ChevronDown, ChevronRight } from "lucide-react";
import { adminGet, CardLabel } from "@/components/admin/ui";

interface Region { region: string; calls: number; pct: number }
interface Country { country: string; flag: string; calls: number; pct: number; regions?: Region[] }

/**
 * Call distribution by destination country, derived from the E.164 prefix.
 * A ranked bar list (rather than a heavy choropleth lib) — dependency-free.
 */
export default function GeoDistribution() {
  const [data, setData] = useState<{ total: number; countries: Country[] }>({ total: 0, countries: [] });
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    adminGet(`/geo?days=${days}`).then(d => setData({ total: d.total || 0, countries: d.countries || [] })).catch(() => {});
  }, [days]);

  const toggle = (name: string) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const max = data.countries.reduce((m, c) => Math.max(m, c.calls), 0) || 1;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-xs p-5">
      <div className="flex items-center justify-between mb-3">
        <CardLabel><span className="inline-flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Calls by country</span></CardLabel>
        <div className="flex gap-1.5">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-2.5 h-7 rounded-lg text-xs font-medium border transition-colors ${days === d ? "bg-brand-50 text-brand-600 border-brand-200" : "text-neutral-500 border-neutral-200 hover:bg-neutral-50"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data.countries.length === 0 ? (
        <p className="text-sm text-neutral-500 py-6 text-center">No calls in this period.</p>
      ) : (
        <div className="space-y-2.5">
          {data.countries.map(c => {
            const hasRegions = !!c.regions && c.regions.length > 0;
            const isOpen = expanded.has(c.country);
            const rMax = hasRegions ? c.regions!.reduce((m, r) => Math.max(m, r.calls), 0) || 1 : 1;
            const Row = (
              <div className="flex items-center gap-3">
                <span className="text-base w-5 text-center shrink-0" aria-hidden>{c.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-700 truncate flex items-center gap-1">
                      {hasRegions && (isOpen ? <ChevronDown className="w-3 h-3 text-neutral-400" /> : <ChevronRight className="w-3 h-3 text-neutral-400" />)}
                      {c.country}
                    </span>
                    <span className="text-neutral-500 shrink-0 ml-2">{c.calls.toLocaleString("en-IN")} <span className="text-neutral-400">({c.pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-400 rounded-full" style={{ width: `${Math.max((c.calls / max) * 100, 2)}%` }} />
                  </div>
                </div>
              </div>
            );
            return (
              <div key={c.country}>
                {hasRegions ? (
                  <button onClick={() => toggle(c.country)} aria-expanded={isOpen} className="w-full text-left">{Row}</button>
                ) : Row}
                {hasRegions && isOpen && (
                  <div className="pl-8 mt-2 space-y-1.5 border-l-2 border-neutral-100 ml-2.5">
                    {c.regions!.map(r => (
                      <div key={r.region} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-[11px] mb-0.5">
                            <span className="text-neutral-600 truncate">{r.region}</span>
                            <span className="text-neutral-400 shrink-0 ml-2">{r.calls.toLocaleString("en-IN")} ({r.pct}%)</span>
                          </div>
                          <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-300 rounded-full" style={{ width: `${Math.max((r.calls / rMax) * 100, 2)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-neutral-400 pt-0.5">Region ≈ by number series (landline = city, mobile = original circle; portability-affected).</p>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-neutral-400 pt-1">{data.total.toLocaleString("en-IN")} calls total · country inferred from dialing code · tap India to see regions</p>
        </div>
      )}
    </div>
  );
}
