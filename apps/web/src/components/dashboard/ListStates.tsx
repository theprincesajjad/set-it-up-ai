"use client";
/**
 * The three states every list and table has (Figma "States: every list and table has all three", frame 12:349):
 *
 *   empty    One sentence, one action. No illustration of people.   -> kit `EmptyState` / `Empty`
 *   loading  Skeleton rows with the same height as real rows.       -> `ListLoading`
 *   error    One sentence and Try again. Say what happened, not an error code. -> `ListError`
 *
 * Kept out of the kit barrel (kit.tsx is frozen); import from "@/components/dashboard/ListStates".
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/** Skeleton rows the height of real rows (h-14 plus the 1 px rule = 57 px, a two-line row with a 40 px avatar). */
export function ListLoading({ rows = 5, label = "Loading", avatar = true, className }: { rows?: number; label?: string; avatar?: boolean; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} data-state="loading" className={cn("overflow-hidden rounded-card border border-line bg-bg", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 border-b border-line px-4 last:border-b-0">
          {avatar ? <Skeleton className="size-10 shrink-0 rounded-full" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A list that could not load: what happened, that the data is safe, and one way forward. */
export function ListError({ title = "We could not load this.", description = "Check your connection and try again. Your data is safe.", onRetry, detail, className }: { title?: string; description?: ReactNode; onRetry?: () => void; /** The server's message, shown small under the description. */ detail?: string | null; className?: string }) {
  return (
    <div role="alert" data-state="error" className={cn("rounded-card border border-line bg-bg p-5", className)}>
      <p className="text-body-strong text-fg">{title}</p>
      {description ? <p className="mt-1 text-meta text-fg-muted">{description}</p> : null}
      {detail ? <p className="mt-1 text-caption text-fg-muted">{detail}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * `Async` for lists: loading shows skeleton rows, a failure shows the error card with Try again (the stale data stays when a reload
 * fails), and `children` renders once there is data. Same `state` shape as `useApi`. Empty is the caller's: return an `EmptyState`.
 */
export function ListAsync<T>({ state, children, label = "Loading", errorTitle, rows = 5, avatar = false }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; label?: string; errorTitle?: string; rows?: number; avatar?: boolean }) {
  if (state.error && !state.data) return <ListError title={errorTitle} detail={state.error} onRetry={state.reload} />;
  if (!state.data) return <ListLoading label={label} rows={rows} avatar={avatar} />;
  return <>{children(state.data)}</>;
}
