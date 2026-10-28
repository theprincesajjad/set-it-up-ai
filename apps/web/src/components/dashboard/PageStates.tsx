"use client";
import type { ReactNode } from "react";
import { ErrorLine } from "./kit";

/** Skeleton matching a page header + a few blocks (skeletons, never full-page spinners). */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-7 w-56 rounded-sm" />
      <div className="skeleton h-4 w-80 max-w-full rounded-sm" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-24 w-full rounded-card" />
      ))}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <ErrorLine message={error} onRetry={onRetry} />;
}

/** Full-page state for a 403 / unknown area: one sentence + one action, left-aligned. */
export function NoAccess({ title = "This area is for owners and managers", body = "Ask the shop owner if you need access.", action }: { title?: string; body?: string; action?: ReactNode }) {
  return (
    <div className="max-w-[520px] py-10">
      <h1 className="text-title text-foreground">{title}</h1>
      <p className="mt-1 text-meta text-muted-foreground">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Async<T>({ state, children, skeleton }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; skeleton?: ReactNode }) {
  if (state.error && !state.data)
    return (
      <div className="py-4">
        <ErrorLine message={state.error} onRetry={state.reload} />
      </div>
    );
  if (!state.data) return <>{skeleton ?? <PageSkeleton />}</>;
  return <>{children(state.data)}</>;
}
