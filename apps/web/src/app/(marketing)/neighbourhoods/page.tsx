import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Neighbourhoods",
  description: `Where ${BRAND.name} is live: shopping streets in Toronto where one card works at every participating shop.`,
  alternates: { canonical: "/neighbourhoods" },
};

export default async function NeighbourhoodsPage() {
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
        <h1 className="display mt-5 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">one neighbourhood at a time.</h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">We launch street by street, with the shops and the BIA. Here&apos;s where your card works today.</p>
      </section>
      <section className="mx-auto max-w-[1200px] px-4 pb-16 md:px-8 md:pb-24">
        {items === null ? (
          <ErrorState title="Can't load neighbourhoods right now" description={copy.err.network} action={<Button variant="secondary" href="/neighbourhoods">Try again</Button>} />
        ) : items.length === 0 ? (
          <EmptyState headingLevel={2} icon={MapPin} title={copy.empty.noNeighbourhood.title} description={copy.empty.noNeighbourhood.body} action={<Button variant="secondary" href={`mailto:${BRAND.supportEmail}?subject=Suggest%20my%20street`}>{copy.empty.noNeighbourhood.action}</Button>} />
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-sheet border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {items.map((n) => (
              <li key={n.id} className="bg-background">
                <Link href={`/neighbourhoods/${n.slug}`} className="flex h-full min-h-56 flex-col gap-2 p-6 transition-colors hover:bg-muted focus-visible:focus-ring md:p-8">
                  <div className="flex items-center justify-between gap-2 text-meta text-muted-foreground">
                    <span>
                      {n.city}, {n.province}
                    </span>
                    <StatusDot tone={n.status === "live" ? "positive" : "neutral"}>{n.status === "live" ? "Live" : "Pilot"}</StatusDot>
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
        <div className="mt-12 grid gap-6 border-t border-border pt-10 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="display text-mkt-sm">{copy.empty.noNeighbourhood.title.toLowerCase()}.</h2>
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
      </section>
    </>
  );
}
