import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { MHeading, MSection } from "@/components/marketing/Section";
import { Badge } from "@/components/ui/Badge";
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
    <MSection>
      <MHeading eyebrow="Where we are" title="One neighbourhood at a time" sub="We launch street by street, with the shops and the BIA. Here's where your card works today." />
      {items === null ? (
        <ErrorState title="Can't load neighbourhoods right now" description={copy.err.network} action={<Button variant="secondary" href="/neighbourhoods">Try again</Button>} />
      ) : items.length === 0 ? (
        <EmptyState icon={MapPin} title={copy.empty.noNeighbourhood.title} description={copy.empty.noNeighbourhood.body} action={<Button variant="tonal" href={`mailto:${BRAND.supportEmail}?subject=Suggest%20my%20street`}>{copy.empty.noNeighbourhood.action}</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={`/neighbourhoods/${n.slug}`} className="flex h-full flex-col gap-2 rounded-xl bg-surface p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:focus-ring">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-h3 text-fg">{n.name}</h2>
                  <Badge tone={n.status === "live" ? "success" : "info"}>{n.status === "live" ? "Live" : "Pilot"}</Badge>
                </div>
                <p className="text-body-sm text-fg-muted">
                  {n.city}, {n.province}
                  {n.biaName ? ` · ${n.biaName}` : ""}
                </p>
                <p className="mt-auto text-title tabular-nums text-fg-brand">
                  {n.shopCount} {n.shopCount === 1 ? "shop" : "shops"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-12 rounded-xl bg-canvas-subtle p-6 md:p-8">
        <h2 className="text-h3 text-fg">{copy.empty.noNeighbourhood.title}</h2>
        <p className="mt-2 text-body text-fg-muted">{copy.empty.noNeighbourhood.body}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="tonal" href={`mailto:${BRAND.supportEmail}?subject=Suggest%20my%20street`}>
            {copy.empty.noNeighbourhood.action}
          </Button>
          <Button variant="ghost" href="/for-bias">
            Run a BIA? Talk to us
          </Button>
        </div>
      </div>
    </MSection>
  );
}
