"use client";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

/** Skeleton block matching a page of cards (system.md: skeletons, never full-page spinners). */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonGroup className="flex flex-col gap-4">
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </SkeletonGroup>
  );
}

export function LoadError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Banner tone="danger" action={onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button> : undefined}>
      {error}
    </Banner>
  );
}

/** Full-page state for a 403 / unknown area. */
export function NoAccess({ title = "This area is for owners and managers", body = "Ask the shop owner if you need access.", action }: { title?: string; body?: string; action?: ReactNode }) {
  return <EmptyState icon={Lock} title={title} description={body} action={action} />;
}

export function Async<T>({ state, children, skeleton }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; skeleton?: ReactNode }) {
  if (state.error && !state.data) return <ErrorState description={state.error} action={<Button variant="secondary" onClick={state.reload}>Try again</Button>} />;
  if (!state.data) return <>{skeleton ?? <PageSkeleton />}</>;
  return <>{children(state.data)}</>;
}
