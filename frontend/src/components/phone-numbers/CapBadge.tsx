import React from "react";

type CapBadgeProps = {
  label: string;
  enabled?: boolean;
  icon: React.ElementType;
};

export default function CapBadge({ label, enabled, icon: Icon }: CapBadgeProps) {
  if (!enabled) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
