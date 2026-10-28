import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { FEES, campaignsApi, isPlanAvailable, type PlanId } from "@ll/shared";
import { ChipLink } from "@/components/marketing/ChipLink";
import { Faq } from "@/components/marketing/Faq";
import { ScrollTo } from "@/components/marketing/ScrollTo";
import { MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { fill, moneyShort } from "@/lib/marketing/text";
import { CompareTable, FreeCard, PLUS_TARGET, PaidCard } from "./PlanCards";
import { TradeRows } from "./TradeRows";
import { RestaurantPricing } from "./RestaurantPricing";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free forever for your loyalty program and its reports, with no subscription and no fee on loyalty. Flat monthly prices for marketing, automations, payments and repair tools, and for restaurants with no commission on online orders.",
  alternates: { canonical: "/pricing" },
};

const P = copy.pricing;

/** Real plan availability + network count from GET /v1/public/plans; shared defaults when the API is down. */
async function publicPlans(): Promise<{ available: Record<PlanId, boolean>; activeShops: number | null }> {
  try {
    const r = await publicServerApi().public.plans();
    const available = { free: true, plus: false, pro: false } as Record<PlanId, boolean>;
    for (const p of r.items) available[p.id] = p.available;
    return { available, activeShops: r.network.activeMerchants };
  } catch {
    return { available: { free: true, plus: isPlanAvailable("plus", {}), pro: isPlanAvailable("pro", {}) }, activeShops: null };
  }
}

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PricingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const audience = one("for") === "restaurant" || one("for") === "bia" ? (one("for") as "restaurant" | "bia") : "shop";
  const compareOpen = one("compare") === "1";
  const { available, activeShops } = await publicPlans();
  const bia = campaignsApi.CAMPAIGN_PACKAGES;
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 pt-14 pb-10 md:px-8 md:pt-24 md:pb-14">
        <p className="text-meta-strong text-muted-foreground">{P.eyebrow}</p>
        <h1 className="display mt-5 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">{P.title}</h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">{P.sub}</p>
        <nav aria-label="Pricing for" className="mt-8 flex flex-wrap gap-2">
          {P.chips.map((c) => (
            <ChipLink key={c.id} href={c.href} current={audience === c.id}>
              {c.label}
            </ChipLink>
          ))}
        </nav>
        {audience !== "shop" ? <ScrollTo id={audience === "restaurant" ? "restaurants" : "bias"} /> : null}
      </section>

      <section id="shops" className="scroll-mt-20 pb-12 md:pb-16">
        <div className="mx-auto grid max-w-[1200px] items-stretch gap-4 px-4 md:px-8 lg:grid-cols-3">
          <FreeCard />
          <PaidCard id="plus" />
          <PaidCard id="pro" />
        </div>
        <p className="mx-auto mt-6 max-w-[1200px] px-4 text-meta text-muted-foreground md:px-8">
          {fill(P.openNote, { target: String(PLUS_TARGET) })}{activeShops !== null ? ` The network has ${activeShops} active shops today.` : ""} Your loyalty program never moves to a paid plan.
        </p>
      </section>

      <TradeRows />

      <RestaurantPricing />

      <MSection id="bias" className="scroll-mt-20 md:py-20!">
        <div className="grid gap-10 md:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="display text-mkt-md md:text-mkt-lg">{P.biaTitle}</h2>
            <p className="mt-4 text-body text-muted-foreground">{P.biaSub}</p>
            <Button href="/for-bias" variant="secondary" className="mt-6 rounded-full!">
              {P.biaCta}
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {(Object.keys(bia) as (keyof typeof bia)[]).map((k) => (
              <li key={k} className="flex items-baseline justify-between gap-6 py-4">
                <div>
                  <p className="text-body-strong text-foreground">{bia[k].name.replace(": ", " · ")}</p>
                  <p className="mt-0.5 text-meta text-muted-foreground">
                    {bia[k].days} days · visit {bia[k].goalVisits} shops
                  </p>
                </div>
                <p className="shrink-0 text-body-strong tabular-nums text-foreground">{moneyShort(bia[k].priceCents)}</p>
              </li>
            ))}
          </ul>
        </div>
      </MSection>

      <section id="compare" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-16 md:px-8 md:pb-24">
        <details open={compareOpen} className="group rounded-card border border-border bg-background" data-testid="compare">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 px-5 text-headline text-foreground focus-visible:focus-ring md:px-7 [&::-webkit-details-marker]:hidden">
            {P.compareSummary}
            <Plus aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-45" strokeWidth={1.75} />
          </summary>
          <div className="border-t border-border px-5 pb-4 md:px-7">
            <CompareTable available={available} />
          </div>
        </details>
      </section>

      <MSection tone="subtle">
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="text-meta-strong text-muted-foreground">{P.faqEyebrow}</p>
            <h2 className="display mt-3 text-mkt-md md:text-mkt-lg">{P.faqTitle}</h2>
          </div>
          <Faq
            items={P.faq.map((f) => ({ q: f.q, a: fill(f.a, { cut: pct(FEES.depositInvoiceBps), target: PLUS_TARGET }) }))}
          />
        </div>
      </MSection>
    </>
  );
}
