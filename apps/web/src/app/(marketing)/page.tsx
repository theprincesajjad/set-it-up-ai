import { ArrowRight, Check, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { categoryLabels, type MapCategoryId } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";
import { AudienceRouter } from "@/components/marketing/AudienceRouter";
import { BiaBand } from "@/components/marketing/BiaBand";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { LiveProof } from "@/components/marketing/LiveProof";
import { JoinScreen, PhoneFrame } from "@/components/marketing/Mocks";
import { HeroArt } from "@/components/marketing/HeroArt";
import { Showcase, TradeColours } from "@/components/marketing/Showcase";
import { TradeChips } from "@/components/marketing/TradeChips";
import { WARM } from "@/components/marketing/warm-copy";
import { RestaurantBand } from "@/components/marketing/RestaurantBand";
import { MHeading, MSection } from "@/components/marketing/Section";
import { TradeStories } from "@/components/marketing/TradeStories";
import { VerticalTemplates } from "@/components/marketing/VerticalTemplates";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { copy } from "@/copy/en-CA";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: free loyalty for independent shops` },
  description: "Free forever, no fee on loyalty. Unlimited locations. A loyalty program for your shop, shared with every shop on your block. Sign up and give your first stamp in about 5 minutes.",
  alternates: { canonical: "/" },
};

const L = copy.landing;

const NETWORK_OBJECTS: MapCategoryId[] = ["coffee", "bakery", "eat", "shops", "beauty", "repair"];
const NETWORK_TONES = ["bg-tile-peach", "bg-tile-mint", "bg-tile-rose", "bg-tile-sky", "bg-tile-lilac", "bg-tile-butter"];

/**
 * Landing, in the order of docs/research/landing-and-network.md §4.2: hero, who-are-you router, live proof, how it works,
 * network, kind of shop, restaurant band, named comparison, BIA band, FAQ, book a visit. One form, one conversion goal.
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  // The last words of the headline are set in terracotta ("this street.").
  const m = /^(.*?)(\s*this street\.?)$/.exec(L.heroTitle);
  const heroHead = m ? `${m[1]} ` : L.heroTitle;
  const heroTail = m ? m[2].trim() : "";
  return (
    <>
      {/* 1. Hero: outcome headline, one verb, a friction line, and a picture that is the product (Mobbin: Beside, Faire, Airtasker). */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-10 pb-12 md:grid-cols-[1fr_1fr] md:gap-12 md:px-8 md:pt-16 md:pb-16">
          <div>
            <p style={{ ["--i" as string]: 0 }} className="mkt-rise inline-flex items-center gap-2 rounded-full bg-tile-peach px-4 py-2 text-meta-strong text-tile-peach-foreground">
              <MapPin aria-hidden className="size-4" strokeWidth={2} />
              {L.heroEyebrow}
            </p>
            <h1 style={{ ["--i" as string]: 1 }} className="display mkt-rise mt-6 text-mkt-lg text-balance md:text-mkt-xl">
              {heroHead}
              {heroTail ? <span className="text-primary-text">{heroTail}</span> : null}
            </h1>
            <p style={{ ["--i" as string]: 2 }} className="mkt-rise mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-muted-foreground">{L.heroSub}</p>
            <div style={{ ["--i" as string]: 3 }} className="mkt-rise mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/signup" iconStart={ArrowRight}>
                Get started free
              </Button>
              <Button size="lg" variant="secondary" href="#book">
                Prefer a hand? Book a visit
              </Button>
            </div>
            <ul style={{ ["--i" as string]: 4 }} className="mkt-rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-meta text-muted-foreground">
              {L.heroTrust.split(" · ").map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check aria-hidden className="size-4 text-forest" strokeWidth={2.5} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroArt caption={WARM.heroCaption} />
        </div>
        <div className="mx-auto max-w-[1200px] px-4 pt-4 pb-10 md:px-8">
          <TradeChips label={WARM.madeFor} />
        </div>
      </section>

      {/* 2. Who are you? */}
      <AudienceRouter />

      {/* 3. Live proof: real counts, hidden until the network passes 10 shops. */}
      <LiveProof />

      {/* 4. How it works, with times. */}
      <MSection id="how">
        <div className="grid items-center gap-14 md:grid-cols-[1fr_1fr]">
          <div>
            <MHeading eyebrow={L.how.eyebrow} title={L.how.title} className="mb-10!" />
            <ol className="flex flex-col gap-4">
              {L.how.steps.map((s, i) => (
                <li key={s.t} className="mkt-lift flex gap-4 rounded-card bg-card p-5 shadow-card">
                  <span className={`display flex size-11 shrink-0 items-center justify-center rounded-[14px] text-title tabular-nums ${["bg-tile-peach text-tile-peach-foreground", "bg-tile-mint text-tile-mint-foreground", "bg-tile-butter text-tile-butter-foreground"][i % 3]}`}>{i + 1}</span>
                  <div>
                    <h3 className="text-headline text-foreground">{s.t}</h3>
                    <p className="mt-1.5 text-body text-muted-foreground">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-center">
            <PhoneFrame height={440}>
              <JoinScreen />
            </PhoneFrame>
          </div>
        </div>
      </MSection>

      {/* The product, as the shop sees it. */}
      <Showcase />

      {/* 5. The network: one image, three lines. */}
      <MSection tone="butter">
        <div className="grid items-center gap-14 md:grid-cols-2">
          {/* The category objects are the only illustration: every kind of shop, one card. */}
          <ul aria-label="Kinds of shop on the card" className="order-2 grid grid-cols-3 gap-3 md:order-1">
            {NETWORK_OBJECTS.map((c, i) => (
              <li key={c} className={`mkt-lift flex flex-col items-center gap-2 rounded-tile px-2 py-6 ${NETWORK_TONES[i]}`}>
                <CategoryIcon category={c} size={64} />
                <span className="display text-meta-strong lowercase text-foreground">{categoryLabels[c]}</span>
              </li>
            ))}
          </ul>
          <div className="order-1 md:order-2">
            <MHeading eyebrow={L.network.eyebrow} title={L.network.title} sub={L.network.sub} className="mb-8!" />
            <ul className="flex flex-col divide-y divide-border border-y border-border text-body text-foreground">
              {L.network.points.map((t) => (
                <li key={t} className="py-4">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MSection>

      {/* 6. Verticals, with a restaurants chip that leaves for the restaurant page. */}
      <MSection id="verticals">
        <MHeading eyebrow={L.verticals.eyebrow} title={L.verticals.title} sub={L.verticals.sub} />
        <VerticalTemplates />
      </MSection>

      <TradeColours />

      <TradeStories />

      {/* 7. Restaurant band: the paying wedge. */}
      <RestaurantBand />

      {/* 8. Free means free: named competitors with dates and sources. */}
      <CompetitorTable />

      {/* Testimonials: omitted until a pilot shop gives a real quote (never fake quotes or logos). */}

      {/* 9. BIA band: one metric, labelled sample data. */}
      <BiaBand />

      {/* 10. FAQ */}
      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <MHeading eyebrow={L.faqEyebrow} title={L.faqTitle} className="mb-0!" />
          <Faq items={[...L.faq]} />
        </div>
      </MSection>

      {/* 11. Book a visit: the single conversion goal. */}
      <MSection tone="peach" id="book">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <MHeading eyebrow={L.book.eyebrow} title={L.book.title} sub={L.book.sub} className="mb-8!" />
            {waUrl ? (
              <Button variant="secondary" size="lg" href={waUrl} className="rounded-full!">
                {L.book.whatsapp}
              </Button>
            ) : null}
          </div>
          <div className="rounded-sheet bg-card p-6 shadow-card md:p-8">
            <ContactForm kind="visit" />
          </div>
        </div>
      </MSection>

      {/* 12. The closing ask: the same verb as the nav and the hero (Mobbin: OpenTable closing band, The Leap). */}
      <MSection tone="brand" className="py-14 md:py-20">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h2 className="display text-mkt-md text-balance md:text-mkt-lg">{WARM.cta.title}</h2>
            <p className="mt-4 text-[17px] leading-[1.55]">{WARM.cta.sub}</p>
          </div>
          <Button size="lg" variant="inverse" href="/signup" iconStart={ArrowRight} className="shrink-0">
            {WARM.cta.primary}
          </Button>
        </div>
      </MSection>
    </>
  );
}
