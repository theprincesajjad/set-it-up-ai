import { CalendarDays, Gift, MapPin, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND, type networkApi } from "@ll/shared";
import { MSection } from "@/components/marketing/Section";
import { Badge } from "@/components/ui/Badge";
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
      <MSection className="!pb-8">
        <Link href="/neighbourhoods" className="text-label text-fg-link underline">
          All neighbourhoods
        </Link>
        <h1 className="mt-4 font-display text-[40px] font-semibold leading-[44px] text-fg md:text-hero">Welcome to {n.name}</h1>
        <p className="mt-3 text-body-lg text-fg-muted">
          {n.shopCount} {n.shopCount === 1 ? "shop" : "shops"} on one card{n.biaName ? `, with the ${n.biaName}` : ""}. {copy.misc.joinTagline}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href={`/map?neighbourhood=${n.slug}`} iconStart={MapPin}>
            Shops near me
          </Button>
          <Button variant="secondary" href="/for-shoppers">
            How it works
          </Button>
        </div>
      </MSection>

      {detail.liveCampaigns.length || detail.perks.length || detail.livePromoCount ? (
        <section className="pb-8">
          <div className="mx-auto grid max-w-[1200px] gap-4 px-4 md:grid-cols-3 md:px-8">
            {detail.liveCampaigns.map((c: networkApi.CampaignBriefDto) => (
              <Link key={c.id} href={`/c/${c.id}`} className="flex flex-col gap-2 rounded-xl bg-accent-subtle p-5 text-on-accent-subtle focus-visible:focus-ring">
                <span className="inline-flex items-center gap-2 text-overline uppercase">
                  <CalendarDays aria-hidden className="size-4" /> On now
                </span>
                <span className="text-h3">{c.name}</span>
                <span className="text-body-sm">
                  Until {formatDate(c.endsAt, true)} · visit {c.goalVisits} shops
                </span>
              </Link>
            ))}
            {detail.perks.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 text-overline uppercase text-fg-muted">
                  <Gift aria-hidden className="size-4" /> Neighbourhood perk
                </span>
                <span className="text-h3 text-fg">{p.name}</span>
                {p.description ? <span className="text-body-sm text-fg-muted">{p.description}</span> : null}
              </div>
            ))}
            {detail.livePromoCount ? (
              <div className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-sm">
                <span className="inline-flex items-center gap-2 text-overline uppercase text-fg-muted">
                  <Megaphone aria-hidden className="size-4" /> Offers
                </span>
                <span className="text-h3 text-fg">{detail.livePromoCount} live offers</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <MSection tone="subtle">
        <h2 className="mb-6 text-h2 text-fg">Shops on {n.name}</h2>
        {shops.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((s) => (
              <li key={s.merchant.id}>
                <ShopTile
                  variant="compact"
                  href={`/shops/${s.merchant.slug}`}
                  shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl }}
                  subtitle={
                    <span className="inline-flex items-center gap-1.5">
                      {s.location?.address ?? n.name}
                      {s.hasPromo ? <Badge tone="accent">Offer</Badge> : null}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-fg-muted">Shops are joining now. Check back soon.</p>
        )}
      </MSection>
    </>
  );
}
