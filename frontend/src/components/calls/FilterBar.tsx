"use client";
import { useState } from "react";
import { Search, Download, SlidersHorizontal, X } from "lucide-react";

export function FilterBar({ search, setSearch, statusFilter, setStatusFilter, dirFilter, setDirFilter, agentFilter, setAgentFilter, dateFilter, setDateFilter, agents, exportCsv }: {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  statusFilter: string;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  dirFilter: string;
  setDirFilter: React.Dispatch<React.SetStateAction<string>>;
  agentFilter: string;
  setAgentFilter: React.Dispatch<React.SetStateAction<string>>;
  dateFilter: string;
  setDateFilter: React.Dispatch<React.SetStateAction<string>>;
  agents: any[];
  exportCsv: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const controls = (
    <>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search number or name…"
          className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 h-9 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all"
        />
      </div>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 bg-white border border-neutral-200 rounded-lg px-2.5 text-sm text-neutral-700 focus:outline-none focus:border-brand-500">
        <option value="all">All statuses</option>
        <option value="completed">Completed</option>
        <option value="live">Live</option>
        <option value="not_answered">No Answer</option>
        <option value="voicemail">Voicemail</option>
        <option value="failed">Failed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select value={dirFilter} onChange={e => setDirFilter(e.target.value)} className="h-9 bg-white border border-neutral-200 rounded-lg px-2.5 text-sm text-neutral-700 focus:outline-none focus:border-brand-500">
        <option value="all">All directions</option>
        <option value="outbound">Outbound</option>
        <option value="inbound">Inbound</option>
      </select>
      <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)} className="h-9 bg-white border border-neutral-200 rounded-lg px-2.5 text-sm text-neutral-700 focus:outline-none focus:border-brand-500 max-w-[10rem]">
        <option value="all">All agents</option>
        {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-9 bg-white border border-neutral-200 rounded-lg px-2.5 text-sm text-neutral-700 focus:outline-none focus:border-brand-500">
        <option value="all">All time</option>
        <option value="today">Today</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
      </select>
      <button
        onClick={exportCsv}
        title="Export filtered calls to CSV"
        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-white hover:bg-neutral-50 text-neutral-700 text-sm font-medium border border-neutral-200 hover:border-neutral-300 rounded-lg transition-colors whitespace-nowrap"
      >
        <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
      </button>
    </>
  );

  return (
    <>
      {/* Mobile filter button */}
      <div className="sm:hidden">
        <button
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 bg-white hover:bg-neutral-50 text-neutral-700 text-sm font-medium border border-neutral-200 hover:border-neutral-300 rounded-lg transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" /> Filter
        </button>
      </div>

      {/* Desktop inline bar */}
      <div className="hidden sm:flex flex-col sm:flex-row gap-2">
        {controls}
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[1px]" onClick={() => setSheetOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl border border-neutral-200 shadow-modal max-h-[80vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
              <h2 className="text-base font-semibold text-neutral-900">Filters</h2>
              <button onClick={() => setSheetOpen(false)} className="text-neutral-400 hover:text-neutral-900"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 flex-1">
              {controls}
            </div>
            <div className="px-5 py-4 border-t border-neutral-200 flex-shrink-0">
              <button
                onClick={() => setSheetOpen(false)}
                className="w-full h-10 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
