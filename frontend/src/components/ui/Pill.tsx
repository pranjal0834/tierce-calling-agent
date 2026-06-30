"use client";
import React from "react";
import { X } from "lucide-react";

type PillProps = {
  children: React.ReactNode;
  selected?: boolean;
  onRemove?: () => void;
  className?: string;
};

export default function Pill({ children, selected = false, onRemove, className = "" }: PillProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors",
        selected
          ? "bg-brand-50 text-brand-700 border-brand-200"
          : "bg-neutral-100 text-neutral-600 border-neutral-200",
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="ml-0.5 rounded-full hover:text-red-500 transition-colors"
        >
          <X className="icon-xs" />
        </button>
      )}
    </span>
  );
}
