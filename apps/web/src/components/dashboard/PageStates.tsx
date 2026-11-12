"use client";
import type { ReactNode } from "react";
import { ErrorPanel } from "@/components/errors";
import { ErrorLine, PageHeader } from "./kit";

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

export function LoadError({ error, onRetry, cause }: { error: string; onRetry?: () => void; cause?: unknown }) {
  return <ErrorLine message={error} cause={cause} onRetry={onRetry} />;
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

/** A detail page's failure: the page name as the h1 (so the tab title is specific), and for a missing record the way back to the list instead of a Try again that cannot work. */
export interface DetailFail {
  title: string;
  back: { href: string; label: string };
  notFound: { title: string; description: string };
  /** 403 in the page's own words (defaults to the generic "You don't have access to this"). */
  forbidden?: { title: string; description: string };
  /** The page already renders its own header above (so the failure does not add a second h1). */
  hasHeader?: boolean;
}

export function Async<T>({ state, children, skeleton, fail }: { state: { data: T | null; error: string | null; cause?: unknown; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; skeleton?: ReactNode; fail?: DetailFail }) {
  if (state.error && !state.data && fail)
    return (
      <>
        {fail.hasHeader ? null : <PageHeader title={fail.title} />}
        <ErrorPanel error={state.cause ?? state.error} onRetry={state.reload} back={fail.back} notFound={fail.notFound} forbidden={fail.forbidden} invalidIsNotFound />
      </>
    );
  if (state.error && !state.data)
    return (
      <div className="py-4">
        <ErrorLine message={state.error} cause={state.cause} onRetry={state.reload} />
      </div>
    );
  if (!state.data) return <>{skeleton ?? <PageSkeleton />}</>;
  return <>{children(state.data)}</>;
}
