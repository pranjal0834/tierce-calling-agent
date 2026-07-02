"use client";
import { ChevronDown } from "lucide-react";

export function SortHeader({ label, field, sortBy, sortDir, onSort, className = "" }: {
  label: string;
  field?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  className?: string;
}) {
  const sortField = field ?? label.toLowerCase();
  const isActive = sortBy === sortField;
  return (
    <th className={`px-4 py-2.5 font-semibold text-neutral-600 whitespace-nowrap cursor-pointer select-none hover:text-neutral-900 transition-colors ${className}`} onClick={() => onSort(sortField)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <ChevronDown className={`w-3 h-3 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} />
        )}
      </span>
    </th>
  );
}
