import { cn } from "@/lib/cn";

/** Shimmer block (respects reduced motion via the `skeleton` utility). */
export function Skeleton({ className, circle }: { className?: string; circle?: boolean }) {
  return <div aria-hidden className={cn("skeleton", circle ? "rounded-full" : "rounded-[6px]", className)} />;
}

/** A busy region with one visually hidden "Loading..." label. */
export function SkeletonGroup({ children, className, label = "Loading..." }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-card border border-line bg-bg p-4">
      <div className="flex items-center gap-3">
        <Skeleton circle className="size-11" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          {Array.from({ length: lines - 1 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-4/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
