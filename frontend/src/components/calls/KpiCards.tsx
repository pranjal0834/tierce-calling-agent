"use client";
import { Phone, CheckCircle2, Clock, DollarSign, Activity } from "lucide-react";
import { fmtDuration } from "./calls-utils";

function KpiCard({ icon, label, value, sub, accent, pulse, onClick, active }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string; pulse?: boolean;
  onClick?: () => void; active?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick!(); } } : undefined}
      className={`bg-white rounded-xl border shadow-xs px-3.5 py-3 min-w-0 transition-all ${
        clickable ? "cursor-pointer hover:border-brand-300 hover:shadow-sm" : ""
      } ${active ? "border-brand-400 ring-2 ring-brand-500/15" : "border-neutral-200"}`}
    >
      <div className="flex items-center gap-1.5 text-neutral-400 mb-1">
        <span className={pulse ? "text-brand-500 animate-pulse" : ""}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-lg font-semibold ${accent || "text-neutral-900"}`}>{value}</span>
        {sub && <span className="text-[11px] text-neutral-400 truncate">{sub}</span>}
      </div>
    </div>
  );
}

export function KpiCards({ total, sampleCount, completedCount, answeredPct, avgDur, totalCost, liveCount, filtersActive, statusFilter, resetFilters, setStatusFilter }: {
  total: number;
  sampleCount?: number;
  completedCount: number;
  answeredPct: number;
  avgDur: number;
  totalCost: number;
  liveCount: number;
  filtersActive: boolean;
  statusFilter: string;
  resetFilters: () => void;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <div className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:gap-2.5 sm:overflow-visible sm:pb-0 sm:snap-none">
      <div className="snap-start shrink-0 w-[160px] sm:w-auto sm:snap-none">
        <KpiCard icon={<Phone className="w-4 h-4" />} label="Total Calls" value={String(total)}
          onClick={resetFilters} active={!filtersActive} />
      </div>
      <div className="snap-start shrink-0 w-[160px] sm:w-auto sm:snap-none">
        <KpiCard icon={<CheckCircle2 className="w-4 h-4" />} label="Answered" value={`${answeredPct}%`} sub={`${completedCount} of ${sampleCount ?? total}`} accent="text-success-600"
          onClick={() => setStatusFilter(s => s === "completed" ? "all" : "completed")} active={statusFilter === "completed"} />
      </div>
      <div className="snap-start shrink-0 w-[160px] sm:w-auto sm:snap-none">
        <KpiCard icon={<Clock className="w-4 h-4" />} label="Avg Duration" value={fmtDuration(avgDur)} />
      </div>
      <div className="snap-start shrink-0 w-[160px] sm:w-auto sm:snap-none">
        <KpiCard icon={<DollarSign className="w-4 h-4" />} label="Total Cost" value={`$${totalCost.toFixed(2)}`} accent="text-warning-600" />
      </div>
      <div className="snap-start shrink-0 w-[160px] sm:w-auto sm:snap-none">
        <KpiCard icon={<Activity className="w-4 h-4" />} label="Live Now" value={String(liveCount)} accent={liveCount ? "text-brand-600" : undefined} pulse={liveCount > 0}
          onClick={() => setStatusFilter(s => s === "live" ? "all" : "live")} active={statusFilter === "live"} />
      </div>
    </div>
  );
}
