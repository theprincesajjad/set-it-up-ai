import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { preloadInter } from "@/lib/fonts/inter";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Neighbourhoods",
  description: `Where ${BRAND.name} is live: shopping streets in Toronto where one card works at every participating shop.`,
  alternates: { canonical: "/neighbourhoods" },
};

export default async function NeighbourhoodsPage() {
  preloadInter();
  let items: Awaited<ReturnType<ReturnType<typeof publicServerApi>["network"]["neighbourhoods"]>>["items"] | null = null;
  try {
    items = (await publicServerApi().network.neighbourhoods()).items;
  } catch {
    items = null;
  }
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 pt-14 pb-12 md:px-8 md:pt-24 md:pb-16">
        <p className="text-meta-strong text-muted-foreground">Where we are</p>
        <h1 className="display mt-5 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">One neighbourhood at a time.</h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">We launch street by street, with the shops and the BIA. Here’s where your card works today.</p>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 pb-16 md:px-8 md:pb-24">
        {items === null ? (
          // The list failed to load: say so (never an empty list that looks real), one way to retry and one way out. The page keeps its own h1.
          <ErrorState
            headingLevel={2}
            title="We couldn’t load the neighbourhoods"
            description="Something went wrong between us and the list of streets. Nothing is lost. Try again in a minute."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="secondary" href="/neighbourhoods">
                  Try again
                </Button>
                <Button variant="ghost" href="/">
                  Back to home
                </Button>
              </div>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState headingLevel={2} icon={MapPin} title={copy.empty.noNeighbourhood.title} description={copy.empty.noNeighbourhood.body} action={<Button variant="secondary" href={`mailto:${BRAND.supportEmail}?subject=Suggest%20my%20street`}>{copy.empty.noNeighbourhood.action}</Button>} />
        ) : (
          // Wave Q: separate cards (was a hairline grid that left an empty grey cell when there were fewer than three streets).
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={`/neighbourhoods/${n.slug}`} className="card-clear mkt-lift group relative flex h-full min-h-56 flex-col gap-2 overflow-hidden rounded-sheet p-6 focus-visible:focus-ring md:p-8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons3d/pin_area@2x.png" alt="" aria-hidden width={64} height={64} className="mb-2 size-16 drop-shadow-md" />
                  <div className="flex items-center justify-between gap-2 text-meta text-muted-foreground">
                    <span>
                      {n.city}, {n.province}
                    </span>
                    <StatusDot tone={n.status === "live" ? "positive" : "neutral"}>{n.status === "live" ? "Live" : "Just starting"}</StatusDot>
                  </div>
                  <h2 className="display mt-auto text-mkt-sm lowercase text-foreground">{n.name}</h2>
                  <p className="text-meta text-muted-foreground">
                    <span className="font-semibold tabular-nums text-foreground">
                      {n.shopCount} {n.shopCount === 1 ? "shop" : "shops"}
                    </span>
                    {n.biaName ? ` · ${n.biaName}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* The invitation to suggest a street. Not under the empty state, which already says the same thing. */}
        {items?.length === 0 ? null : (
        <div className="mt-12 grid gap-6 border-t border-border pt-10 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="display text-mkt-sm">{copy.empty.noNeighbourhood.title}.</h2>
            <p className="mt-2 text-body text-muted-foreground">{copy.empty.noNeighbourhood.body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" href={`mailto:${BRAND.supportEmail}?subject=Suggest%20my%20street`}>
              {copy.empty.noNeighbourhood.action}
            </Button>
            <Button variant="secondary" size="lg" href="/for-bias">
              Run a BIA? Talk to us
            </Button>
          </div>
        </div>
        )}
      </section>
    </>
  );
}
