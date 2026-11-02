/**
 * Wave Q (customer): the /me loading screen (route `loading.tsx`; shop routes have none on purpose, so notFound() keeps its 404 status), shaped like the page that is coming so nothing jumps
 * when it lands. Shimmer from the `skeleton` utility (still under reduced motion), one translated "Loading..." for screen readers.
 */
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { getT } from "@/lib/i18n/server";

/** /me: the greeting, the pass card on its colour field, the two buttons, the row of other cards. */
export async function WalletSkeleton() {
  const t = await getT();
  return (
    <SkeletonGroup label={t("ui.skeleton.loading")} className="flex flex-col gap-4 pb-32">
      <div className="flex min-h-11 items-center justify-between">
        <Skeleton className="h-6 w-28" />
        <div className="flex gap-2"><Skeleton circle className="size-11" /><Skeleton circle className="size-11" /></div>
      </div>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-55 w-full rounded-r8" />
      <div className="grid grid-cols-2 gap-3"><Skeleton className="h-12 rounded-full" /><Skeleton className="h-12 rounded-full" /></div>
      <Skeleton className="mt-2 h-3 w-28" />
      <div className="flex gap-3 overflow-hidden"><Skeleton className="h-41 w-[82%] shrink-0 rounded-r6" /><Skeleton className="h-41 w-[82%] shrink-0 rounded-r6" /></div>
    </SkeletonGroup>
  );
}
