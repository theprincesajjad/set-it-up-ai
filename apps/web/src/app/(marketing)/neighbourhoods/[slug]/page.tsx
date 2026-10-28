import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND, type networkApi } from "@ll/shared";
import { MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";
import { ShopTile } from "@/components/ui/ShopTile";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { publicServerApi } from "@/lib/api/server";
import { formatDate } from "@/lib/format";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const api = publicServerApi();
  try {
    const [detail, shops] = await Promise.all([api.network.neighbourhood(slug), api.network.shops({ neighbourhood: slug, limit: 100 })]);
    return { detail, shops: shops.items };
  } catch (e) {
    if (isApiError(e) && e.status === 404) notFound();
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const d = await publicServerApi().network.neighbourhood(slug);
    return {
      title: `${d.neighbourhood.name} shops`,
      description: `${d.neighbourhood.shopCount} independent shops on ${d.neighbourhood.name} share one loyalty card. Earn at every one of them with ${BRAND.name}.`,
      alternates: { canonical: `/neighbourhoods/${slug}` },
    };
  } catch {
    return { title: "Neighbourhood" };
  }
}

export default async function NeighbourhoodPage({ params }: Props) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return <MSection><ErrorState title="Can't load this neighbourhood right now" description={copy.err.network} action={<Button variant="secondary" href={`/neighbourhoods/${slug}`}>Try again</Button>} /></MSection>;
  const { detail, shops } = data;
  const n = detail.neighbourhood;
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 pt-10 pb-12 md:px-8 md:pt-16 md:pb-16">
        <Link href="/neighbourhoods" className="text-meta-strong text-muted-foreground hover:text-foreground">
          ← All neighbourhoods
        </Link>
        <h1 className="display mt-8 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">Welcome to {n.name}</h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">
          {n.shopCount} {n.shopCount === 1 ? "shop" : "shops"} on one card{n.biaName ? `, with the ${n.biaName}` : ""}. {copy.misc.joinTagline}
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button size="lg" href={`/map?neighbourhood=${n.slug}`}>
            Shops near me
          </Button>
          <Button variant="secondary" size="lg" href="/for-shoppers">
            How it works
          </Button>
        </div>
      </section>

      {detail.liveCampaigns.length || detail.perks.length || detail.livePromoCount ? (
        <section className="mx-auto max-w-[1200px] px-4 pb-12 md:px-8">
          <div className="grid gap-px overflow-hidden rounded-sheet border border-border bg-border md:grid-cols-3">
            {detail.liveCampaigns.map((c: networkApi.CampaignBriefDto) => (
              <Link key={c.id} href={`/c/${c.id}`} className="flex flex-col gap-2 bg-background p-6 transition-colors hover:bg-muted focus-visible:focus-ring">
                <span className="flex items-center gap-2 text-meta text-muted-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-points" /> On now
                </span>
                <span className="text-headline text-foreground">{c.name}</span>
                <span className="text-meta text-muted-foreground">
                  Until {formatDate(c.endsAt, true)} · visit {c.goalVisits} shops
                </span>
              </Link>
            ))}
            {detail.perks.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 bg-background p-6">
                <span className="text-meta text-muted-foreground">Neighbourhood perk</span>
                <span className="text-headline text-foreground">{p.name}</span>
                {p.description ? <span className="text-meta text-muted-foreground">{p.description}</span> : null}
              </div>
            ))}
            {detail.livePromoCount ? (
              <div className="flex flex-col gap-2 bg-background p-6">
                <span className="text-meta text-muted-foreground">Offers</span>
                <span className="text-headline text-foreground">{detail.livePromoCount} live offers</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <MSection tone="subtle">
        <h2 className="display mb-8 text-mkt-sm md:text-mkt-md">shops on {n.name.toLowerCase()}.</h2>
        {shops.length ? (
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s) => (
              <li key={s.merchant.id}>
                <ShopTile
                  variant="compact"
                  href={`/shops/${s.merchant.slug}`}
                  shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }}
                  subtitle={
                    <span className="inline-flex items-center gap-2">
                      <span className="truncate">{s.location?.address ?? n.name}</span>
                      {s.hasPromo ? <span className="shrink-0 font-semibold text-points-text">Offer</span> : null}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-muted-foreground">Shops are joining now. Check back soon.</p>
        )}
      </MSection>
    </>
  );
}
