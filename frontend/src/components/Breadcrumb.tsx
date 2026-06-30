"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb { label: string; href?: string }

/** Hierarchy breadcrumb, e.g. Agents › Sales Agent. The last item is the current page. */
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-neutral-400 mb-1.5">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
            {c.href && !last
              ? <Link href={c.href} className="hover:text-neutral-700 transition-colors truncate">{c.label}</Link>
              : <span className="text-neutral-600 font-medium truncate">{c.label}</span>}
          </span>
        );
      })}
    </nav>
  );
}
