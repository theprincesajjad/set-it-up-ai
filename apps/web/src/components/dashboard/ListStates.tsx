"use client";
/**
 * The three states every list and table has (Figma "States: every list and table has all three", frame 12:349):
 *
 *   empty    One sentence, one action. No illustration of people.   -> kit `EmptyState` / `Empty`
 *   loading  Skeleton rows with the same height as real rows.       -> `ListLoading`
 *   error    Say what happened by cause, and the one action that can fix it (Try again, Sign in again). -> `ListError`
 *
 * Kept out of the kit barrel (kit.tsx is frozen); import from "@/components/dashboard/ListStates".
 */
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorPanel } from "@/components/errors/ErrorView";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** True once `ms` have passed since mount: a load that is taking longer than usual says so instead of looking frozen. */
function useSlow(ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return slow;
}

/**
 * Skeleton rows the height of real rows (h-14 plus the 1 px rule = 57 px, a two-line row with a 40 px avatar). After 8 seconds it adds
 * "Still loading. This is taking longer than usual." and, when `onRetry` is given, a Try again.
 */
export function ListLoading({ rows = 5, label = "Loading", avatar = true, className, onRetry }: { rows?: number; label?: string; avatar?: boolean; className?: string; onRetry?: () => void }) {
  const slow = useSlow(8000);
  const { t } = useLocaleOrEnglish();
  return (
    <div role="status" aria-busy="true" aria-label={label} data-state="loading" className={cn("overflow-hidden rounded-card border border-line bg-card", className)}>
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
      {slow ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-meta text-fg-muted">
          <span>{t("err.slow")}</span>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("err.action.retry")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A list that could not load. Says what happened by CAUSE (offline, our server, rate limit, session ended, not found), not one fixed
 * "check your connection": pass `cause` (the thrown error, `useApi().cause`) or `detail` (the message string, still understood), and the
 * title of the list in `title` ("Couldn't load your customers."). A session that ended offers "Sign in again" (back to this page); a 404
 * offers no Try again, since retrying cannot help. `description` is kept for callers that need their own sentence.
 */
export function ListError({ title, description, onRetry, detail, cause, className }: { title?: string; description?: ReactNode; onRetry?: () => void; /** The message string (`useApi().error`). */ detail?: string | null; /** The thrown error behind it (`useApi().cause`): preferred, it carries the status and Retry-After. */ cause?: unknown; className?: string }) {
  if (description && !cause && !detail) {
    return (
      <div role="alert" data-state="error" className={cn("rounded-card border border-line bg-card p-5", className)}>
        <p className="text-body-strong text-fg">{title}</p>
        <p className="mt-1 text-meta text-fg-muted">{description}</p>
        {onRetry ? (
          <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  return <ErrorPanel error={cause ?? detail ?? null} heading={title} onRetry={onRetry} className={className} />;
}

/**
 * `Async` for lists: loading shows skeleton rows, a failure shows the error card with Try again (the stale data stays when a reload
 * fails), and `children` renders once there is data. Same `state` shape as `useApi`. Empty is the caller's: return an `EmptyState`.
 */
export function ListAsync<T>({ state, children, label = "Loading", errorTitle, rows = 5, avatar = false }: { state: { data: T | null; error: string | null; cause?: unknown; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; label?: string; errorTitle?: string; rows?: number; avatar?: boolean }) {
  if (state.error && !state.data) return <ListError title={errorTitle} detail={state.error} cause={state.cause} onRetry={state.reload} />;
  if (!state.data) return <ListLoading label={label} rows={rows} avatar={avatar} onRetry={state.reload} />;
  return <>{children(state.data)}</>;
}
