"use client";

/**
 * Content-shaped loading placeholders. Prefer these over a bare spinner for
 * data-heavy pages so the layout appears instantly and doesn't shift when data
 * arrives. All variants animate with Tailwind's `animate-pulse`.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-neutral-200/70 ${className}`} />;
}

/** A row of KPI stat cards (dashboard / analytics / billing headers). */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-neutral-200 shadow-sm rounded-2xl p-4 space-y-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** A vertical list of rows — for call lists, tables, transaction history. */
export function SkeletonList({ rows = 6, className = "" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 bg-white border border-neutral-200 rounded-xl px-4 py-3">
          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A large card placeholder — for charts / panels. */
export function SkeletonCard({ className = "h-56" }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`bg-white border border-neutral-200 shadow-sm rounded-2xl p-5 ${className}`}>
      <Skeleton className="h-4 w-40 mb-4" />
      <Skeleton className="h-[calc(100%-2rem)] w-full rounded-xl" />
    </div>
  );
}
