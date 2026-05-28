// src/components/ui/Pill.tsx
"use client";
import React from "react";
import { classes } from "@/lib/theme"; // corrected import

type PillProps = {
  children: React.ReactNode;
  selected: boolean;
  onRemove?: () => void;
  className?: string;
};

export default function Pill({
  children,
  selected,
  onRemove,
  className = "",
}: PillProps) {
  const base = `${classes.pill(selected)} inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500`;
  return (
    <span className={`${base} ${className}`.trim()}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove language"
          className="ml-0.5 text-xs"
        >
          ×
        </button>
      )}
    </span>
  );
}
