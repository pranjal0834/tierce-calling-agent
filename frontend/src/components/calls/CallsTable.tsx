"use client";
import { Phone, Search as SearchIcon, ChevronRight, ChevronLeft, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { toUTC, IST, fmtDuration, StatusBadge, SentimentDot } from "./calls-utils";

export function CallsTable({ filtered, pagedCalls, totalPages, currentPage, setPage, detail, openCall, filtersActive, calls }: {
  filtered: any[];
  pagedCalls: any[];
  totalPages: number;
  currentPage: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  detail: any | null;
  openCall: (call: any) => void;
  filtersActive: boolean;
  calls: any[];
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm flex flex-col">
      <div className="px-4 py-3 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
        Call Logs ({filtered.length}{filtersActive ? ` of ${calls.length}` : ""})
      </div>
      <div className="divide-y divide-neutral-100 overflow-y-auto max-h-[64vh]">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center">
              {filtersActive ? <SearchIcon className="w-7 h-7 text-neutral-400" /> : <Phone className="w-7 h-7 text-neutral-400" />}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-500">{filtersActive ? "No matching calls" : "No calls yet"}</p>
              <p className="text-xs text-neutral-400 mt-1">
                {filtersActive ? "Try clearing or changing your filters." : "Dial a number above to place your first call."}
              </p>
            </div>
          </div>
        )}
        {pagedCalls.map((call: any) => {
          const isSelected = detail?.call?.id === call.id;
          return (
            <button
              key={call.id}
              onClick={() => openCall(call)}
              className={`w-full px-4 py-3 text-left transition-colors ${isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    call.direction === "outbound" ? "bg-brand-500/15" : "bg-success-500/15"
                  }`}>
                    {call.direction === "outbound"
                      ? <ArrowUpRight className="w-3.5 h-3.5 text-brand-400" />
                      : <ArrowDownLeft className="w-3.5 h-3.5 text-success-400" />}
                  </div>
                  <div className="min-w-0">
                    {call.extra_data?.caller_name ? (
                      <p className="text-sm font-medium text-neutral-900 truncate">{call.extra_data.caller_name}</p>
                    ) : (
                      <p className="text-sm font-medium text-neutral-900 truncate font-mono">{call.phone_number}</p>
                    )}
                    <p className="text-xs text-neutral-500 mt-0.5 truncate">
                      {call.extra_data?.caller_name ? <span className="font-mono">{call.phone_number} · </span> : null}
                      {new Date(toUTC(call.created_at)).toLocaleDateString("en-IN", { timeZone: IST, day: "2-digit", month: "short" })}
                      {" · "}{new Date(toUTC(call.created_at)).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true })}
                      {call.duration_seconds ? ` · ${fmtDuration(call.duration_seconds)}` : ""}
                      {call.cost_usd != null ? ` · $${call.cost_usd.toFixed(4)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {call.sentiment_score != null && <SentimentDot score={call.sentiment_score} />}
                  <StatusBadge status={call.status} />
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-neutral-200 mt-auto">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:pointer-events-none px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs text-neutral-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 disabled:opacity-40 disabled:pointer-events-none px-2 py-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
