import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, FEES } from "@ll/shared";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { LiveProof } from "@/components/marketing/LiveProof";
import { TradeMarquee } from "@/components/marketing/TradeMarquee";
import { CounterPreview } from "@/components/marketing/landing/CounterPreview";
import {
  AskBubbles,
  IconDog,
  IconPolish,
  IconScissors,
  MapScene,
  Megaphone,
  MainStreet,
  SpotBooking,
  SpotBowl,
  SpotShops,
  SpotStreet,
  StepJoin,
  StepSetup,
  StepStamp,
  VisitCalendar,
  WeekBars,
} from "@/components/marketing/landing/Illustrations";
import { Phone, StampCard } from "@/components/marketing/landing/StampCard";
import "@/components/marketing/landing/landing.css";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { copy } from "@/copy/en-CA";
import { marketingFontVars } from "@/lib/marketing/fonts";
import { marketingPlans, planLine, planNote, planVars } from "@/lib/marketing/plan-copy";
import { fill } from "@/lib/marketing/text";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

export const revalidate = 300;

const L = copy.landing;
const M = L.mock;

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: ${L.meta.title}` },
  description: L.meta.description,
  alternates: { canonical: "/" },
};

/** Plan and fee fills for the home copy: names and prices from lib/marketing/plan-copy.ts (PLANS), the order fee from FEES. */
const VARS = { ...planVars(), orderFee: Number((FEES.orderBpsFree / 100).toFixed(2)) };
const f = (s: string) => fill(s, VARS);

/**
 * Every ask on the page goes to the sign-up entry and carries its data-cta (the funnel counts them). Violet pill by default; `quiet` is
 * the white outlined pill, `sun` the yellow pill used on the violet blocks.
 */
function Primary({ cta, children, tone = "violet" }: { cta: string; children: React.ReactNode; tone?: "violet" | "quiet" | "sun" }) {
  return (
    <Link href="/signup" prefetch={false} className={tone === "violet" ? "lp-btn" : tone === "sun" ? "lp-btn lp-btn-sun" : "lp-btn2"} data-cta={cta}>
      {children}
    </Link>
  );
}

/** A small floating note on a mockup: an icon bubble, a bold line and a quiet one (sample data from the copy). */
function Note({ b, s, tone = "mint", className }: { b: string; s: string; tone?: "mint" | "sun" | "coral" | "violet"; className?: string }) {
  return (
    <span className={`lp-note ${className ?? ""}`} aria-hidden>
      <span className={`lp-note-i lp-tone-${tone}`}>
        <Check strokeWidth={3} />
      </span>
      <span className="grid">
        <b>{b}</b>
        <small>{s}</small>
      </span>
    </span>
  );
}

const STEP_ART = [StepSetup, StepJoin, StepStamp];
/** The hero's second note: the week's visits (sample, from the "Know how your week went" row), so the hero shows more than stamps. */
const WEEK_NOTE = L.outcomes.rows.find((r) => r.id === "week")!.floats[0]!;
const DOOR_ART = [SpotShops, SpotBooking, SpotBowl, SpotStreet];
const CHIP_ICON: Record<string, (p: { className?: string }) => React.ReactNode> = { "/for-nail-techs": IconPolish, "/for-barbers": IconScissors, "/for-groomers": IconDog };

/**
 * The home page, wave S (friendly and colourful, after the founder turned down wave R's paper-and-serif page), calmed in S2 so it fits a
 * phone repair shop as well as a café: a white page carrying big rounded blocks in soft tints with violet as the one strong colour, flat
 * inline-SVG spot art with an ink outline (a main street of mixed shops in the hero), and the product drawn in code in friendly frames
 * (a repair shop's card on a phone, the counter tablet, a Today card, a salon's promo note, the map). Samples are spread across trades.
 * Order (e2e/marketing-bia.spec.ts): the promise on the sun block, live counts and trades, how it works with the counter on violet, what it
 * does as alternating feature blocks, where you fit as four colour tiles, the plans, the dated comparison, questions, a visit, the closing
 * band. Static (re-generated every 5 minutes for the live counts); no client script of its own beyond the visit form and the questions.
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  const plans = marketingPlans("shop");
  const rows = L.outcomes.rows.filter((r) => r.id !== "pass");
  const stat = (i: number) => M.stats[i]!;
  return (
    // data-solo-trade="home": the landing beacon's page marker (LandingMeasure below); "/" is counted for the admin funnel (wave N).
    <div className={`mkt ${marketingFontVars} lp`} data-solo-trade="home">
      {/* 1. The promise, on the lilac block, with a main street of mixed shops and a repair shop's card on a phone */}
      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-wrap">
          <div className="lp-hero-panel">
            <div className="lp-hero-copy">
              <h1 className="lp-h1" id="lp-title">
                {L.hero.title}
              </h1>
              <p className="lp-lede">
                {L.hero.sub} <b data-testid="hero-price">{L.hero.free}</b>
              </p>
              <div className="lp-actions">
                <Primary cta="hero">
                  {L.hero.primary}
                  <ArrowRight aria-hidden strokeWidth={2.25} />
                </Primary>
                <a className="lp-btn2" href="#how" data-cta="how">
                  {L.hero.secondary}
                </a>
              </div>
              <ul className="lp-trust">
                {L.heroTrust.split(" · ").map((t) => (
                  <li key={t}>
                    <Check aria-hidden strokeWidth={3} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lp-hero-art">
              <MainStreet className="lp-shop" />
              <Phone className="lp-hero-phone">
                <StampCard />
              </Phone>
              <Note b={L.card.note.b} s={L.card.note.s} className="lp-note-a" />
              <Note b={WEEK_NOTE.b} s={WEEK_NOTE.s} tone="sun" className="lp-note-b" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Live proof (real counts, hidden until the network passes 10 businesses) and the trades it is set up for */}
      <div className="lp-band">
        <div className="lp-wrap">
          <LiveProof />
          <TradeMarquee />
        </div>
      </div>

      {/* 3. How it works: three illustrated steps, then the counter screen on the violet block */}
      <section className="lp-sec" id="how" aria-labelledby="lp-how">
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2" id="lp-how">
              {L.how.title}
            </h2>
            <p className="lp-lede">{L.how.sub}</p>
          </div>
          <ol className="lp-steps">
            {L.how.steps.map((s, i) => {
              const Art = STEP_ART[i]!;
              return (
                <li key={s.t} className={`lp-step lp-step-${i + 1}`}>
                  <Art className="lp-step-art" />
                  <span className="lp-step-n">{i + 1}</span>
                  <h3 className="lp-h3">{s.t}</h3>
                  <p className="lp-body">{s.b}</p>
                </li>
              );
            })}
          </ol>
          <div className="lp-counter-panel">
            <CounterPreview />
            <p className="lp-caption">{L.counterCaption}</p>
          </div>
        </div>
      </section>

      {/* 4. What it does after the first stamp: one colour block per outcome, the product beside the words, sides alternating */}
      <section className="lp-sec" id="product" aria-labelledby="lp-product">
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2" id="lp-product">
              {L.outcomes.title}
            </h2>
            <p className="lp-lede">{L.outcomes.sub}</p>
          </div>
          <ul className="lp-features">
            {rows.map((r) => (
              <li key={r.id} id={`outcome-${r.id}`} className={`lp-feature lp-feature-${r.id}`}>
                <div className="lp-feature-copy">
                  <h3 className="lp-h3 lp-h3-lg">{r.title}</h3>
                  <p className="lp-body">{r.body}</p>
                  <ul className="lp-points">
                    {(r.id === "promos" ? [...r.points, planLine("promoAllowance")] : r.points).map((p) => (
                      <li key={p}>
                        <Check aria-hidden strokeWidth={3} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="lp-feature-art" role="img" aria-label={r.label}>
                  {r.id === "week" ? (
                    <div className="lp-today">
                      <span className="lp-today-h" aria-hidden>
                        <b>{M.greeting}</b>
                        <small>{M.date}</small>
                      </span>
                      <span className="lp-today-stats" aria-hidden>
                        {[0, 2].map((i) => (
                          <span key={i}>
                            <small>{stat(i).label}</small>
                            <b>{stat(i).value}</b>
                            <em className={stat(i).tone === "up" ? "is-up" : undefined}>{stat(i).chip}</em>
                          </span>
                        ))}
                      </span>
                      <WeekBars className="lp-today-chart" />
                    </div>
                  ) : r.id === "promos" ? (
                    <div className="lp-promo">
                      <Megaphone className="lp-promo-art" />
                      <span className="lp-promo-note" aria-hidden>
                        <span className="lp-promo-icon">{L.promoShop.charAt(0)}</span>
                        <span className="grid">
                          <small>{L.promoShop}</small>
                          <b>{L.hero.floats[1]!.b}</b>
                          <span>{L.hero.floats[1]!.s}</span>
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="lp-map">
                      <MapScene className="lp-map-art" />
                      {r.floats[0] ? <Note b={r.floats[0].b} s={r.floats[0].s} tone="violet" className="lp-map-note" /> : null}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="lp-actions lp-ctarow">
            <Primary cta="outcomes">{L.outcomes.cta}</Primary>
            <a className="lp-link" href="#pricing" data-cta="seepricing">
              {L.outcomes.pricing}
              <ArrowRight aria-hidden strokeWidth={2} />
            </a>
          </div>
        </div>
      </section>

      {/* 5. Where do you fit? Four colour tiles, each one link (the whole tile is the target) */}
      <section className="lp-sec" aria-label={L.router.label}>
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2">{L.router.title}</h2>
            <p className="lp-lede">{L.router.sub}</p>
          </div>
          <ul className="lp-doors">
            {L.router.items.map((d, i) => {
              const Art = DOOR_ART[i]!;
              return (
                <li key={d.href} className={`lp-door lp-door-${i + 1}`}>
                  <Art className="lp-door-art" />
                  <span className="grid gap-1">
                    <span className="lp-door-k">{d.eyebrow}</span>
                    <span className="lp-door-t">{d.title}</span>
                  </span>
                  <span className="lp-body">{d.body}</span>
                  <Link href={d.href} prefetch={false} className="lp-row-go">
                    {d.cta}
                    <ArrowRight aria-hidden strokeWidth={2} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <nav aria-label={copy.solo.chipsLabel} className="lp-booking">
            <span>{copy.solo.chipsLabel}</span>
            {copy.solo.chips.map((c) => {
              const Icon = CHIP_ICON[c.href];
              return (
                <Link key={c.href} href={c.href} prefetch={false}>
                  {Icon ? <Icon className="lp-chip-i" /> : null}
                  {c.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      {/* 6. Pricing on the soft band: every word from lib/marketing/plan-copy.ts, every number from PLANS; Pro is the violet card */}
      <section className="lp-sec lp-sec-soft" id="pricing" aria-labelledby="lp-pricing">
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2" id="lp-pricing">
              {L.pricing.title}
            </h2>
            <p className="lp-lede">{f(L.pricing.sub)}</p>
          </div>
          <div className="lp-plans">
            {plans.map((p) => (
              <div key={p.key} data-plan={p.key} className={`lp-plan lp-plan-${p.key}`}>
                <div className="lp-plan-h">
                  <span className="lp-plan-name">{p.name}</span>
                  {p.badge ? <span className="lp-plan-badge">{p.badge}</span> : null}
                </div>
                <span className="lp-plan-price">
                  {p.price}
                  {p.per ? <small>{p.per}</small> : null}
                </span>
                <span className="lp-plan-yearly" data-plan={p.key === "monthly" ? "yearly" : undefined}>
                  {p.yearly ? (
                    p.yearly.was ? (
                      <>
                        {p.yearly.or} <s>{p.yearly.was}</s> <b>{p.yearly.now}</b> {p.yearly.label}
                      </>
                    ) : (
                      p.yearly.line
                    )
                  ) : null}
                </span>
                <span className="lp-plan-tag">{p.tagline}</span>
                <ul>
                  {p.features.map((x) => (
                    <li key={x}>
                      <Check aria-hidden strokeWidth={3} />
                      {x}
                    </li>
                  ))}
                </ul>
                <Primary cta="pricing" tone={p.key === "monthly" ? "sun" : "quiet"}>
                  {p.cta}
                </Primary>
              </div>
            ))}
          </div>
          <p className="lp-plans-note">
            <span>{planNote("shop")}</span>
            <Link href="/pricing" prefetch={false} className="lp-link">
              {L.pricing.all}
            </Link>
            <span>
              {L.pricing.restaurants}{" "}
              <Link href="/for-restaurants" prefetch={false} className="lp-link">
                {L.pricing.restaurantsLink}
              </Link>
            </span>
          </p>
        </div>
      </section>

      {/* 7. How we compare: named, dated, sourced */}
      <CompetitorTable />

      {/* 8. Questions, beside the speech bubbles */}
      <section className="lp-sec" aria-labelledby="lp-faq">
        <div className="lp-wrap lp-faq">
          <div className="lp-faq-side">
            <h2 className="lp-h2" id="lp-faq">
              {L.faqTitle}
            </h2>
            <div className="lp-faq-art">
              <AskBubbles />
            </div>
          </div>
          <Faq className="lp-faq-list" items={L.faq.map((q) => ({ q: q.q, a: f(q.a) }))} />
        </div>
      </section>

      {/* 9. A hand getting set up, on the mint block */}
      <section className="lp-sec lp-sec-tight" id="book" aria-labelledby="lp-book">
        <div className="lp-wrap">
          <div className="lp-book">
            <div className="lp-book-copy">
              <h2 className="lp-h2" id="lp-book">
                {L.book.title}
              </h2>
              <p className="lp-lede">{L.book.sub}</p>
              {waUrl ? (
                <a className="lp-btn2" href={waUrl}>
                  {L.book.whatsapp}
                </a>
              ) : null}
              <VisitCalendar className="lp-book-art" />
            </div>
            <div className="lp-book-form">
              <ContactForm kind="visit" />
            </div>
          </div>
        </div>
      </section>

      {/* 10. The closing ask, on the violet band */}
      <section className="lp-final" aria-labelledby="lp-final">
        <div className="lp-wrap">
          <div className="lp-final-in">
            <h2 className="lp-h2" id="lp-final">
              {L.final.title}
            </h2>
            <p className="lp-lede">{L.final.sub}</p>
            <Primary cta="final" tone="sun">
              {L.final.cta}
              <ArrowRight aria-hidden strokeWidth={2.25} />
            </Primary>
          </div>
        </div>
      </section>

      {/* Phones: the button in reach (hidden over the hero and the closing band where the browser has scroll-driven animation). */}
      <div className="lp-sticky">
        <Primary cta="sticky">{L.sticky}</Primary>
      </div>
      <LandingMeasure path="/" />
    </div>
  );
}
