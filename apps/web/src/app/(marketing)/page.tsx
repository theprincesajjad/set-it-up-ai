import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { preload } from "react-dom";
import { BRAND, FEES } from "@ll/shared";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { LiveProof } from "@/components/marketing/LiveProof";
import { TradeMarquee } from "@/components/marketing/TradeMarquee";
import { CounterPreview } from "@/components/marketing/landing/CounterPreview";
import { StampCard } from "@/components/marketing/landing/StampCard";
import "@/components/marketing/landing/landing.css";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { copy } from "@/copy/en-CA";
import { marketingFontVars } from "@/lib/marketing/fonts";
import { marketingPlans, planLine, planNote, planVars } from "@/lib/marketing/plan-copy";
import { fill } from "@/lib/marketing/text";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

export const revalidate = 300;

const L = copy.landing;

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: ${L.meta.title}` },
  description: L.meta.description,
  alternates: { canonical: "/" },
};

/** Plan and fee fills for the home copy: names and prices from lib/marketing/plan-copy.ts (PLANS), the order fee from FEES. */
const VARS = { ...planVars(), orderFee: Number((FEES.orderBpsFree / 100).toFixed(2)) };
const f = (s: string) => fill(s, VARS);

/** The one ink button. Every ask on the page goes to the sign-up entry and carries its data-cta (the funnel counts them). */
function Primary({ cta, children, quiet }: { cta: string; children: React.ReactNode; quiet?: boolean }) {
  return (
    <Link href="/signup" prefetch={false} className={quiet ? "lp-btn2" : "lp-btn"} data-cta={cta}>
      {children}
    </Link>
  );
}

/** A 1 x 1 transparent GIF: phones fetch nothing for the scene (it is hidden there, see below). */
const NO_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * The counter scene (generated, no text in it) behind the hero from 1024 px, in AVIF with a WebP fallback, sized by width. Phones show
 * the stamp card on the wall colour without the photo: measured on a throttled phone, the photo became the largest paint and cost about
 * 100 ms of LCP, and the card is the moment there anyway.
 */
const SCENE_AVIF = "/marketing/counter-960.avif 960w, /marketing/counter-1280.avif 1280w, /marketing/counter-1600.avif 1568w";
const SCENE_WEBP = "/marketing/counter-960.webp 960w, /marketing/counter-1280.webp 1280w, /marketing/counter-1600.webp 1568w";

function Scene() {
  // The browser's preload scanner skips a <picture> whose <img> has no real src, so the wide screens get the scene through a preload.
  preload("/marketing/counter-1600.avif", { as: "image", type: "image/avif", imageSrcSet: SCENE_AVIF, imageSizes: "100vw", media: "(min-width: 1024px)", fetchPriority: "high" });
  return (
    <picture className="lp-scene">
      <source media="(min-width: 1024px)" type="image/avif" srcSet={SCENE_AVIF} sizes="100vw" />
      <source media="(min-width: 1024px)" type="image/webp" srcSet={SCENE_WEBP} sizes="100vw" />
      <img src={NO_IMAGE} alt={L.hero.sceneAlt} width={1568} height={882} fetchPriority="high" />
    </picture>
  );
}

/**
 * The home page, wave R (unslop pass). One moment: the stamp card, a real crafted card object lying on a main-street counter in window
 * light. One signature: the ink stamp (the card's stamps and the logo). The chrome around it is quiet: warm paper, ink buttons, hairlines.
 * Order: the promise on the scene, live counts and trades, how it works beside the counter screen, what it does, where you fit, the
 * plans, the dated comparison, questions, a visit, the closing ask. Gone in wave R: the device collage and its floating notes, the
 * trades marquee, the bento, the outcome device mocks, the price paragraph and check row under the hero buttons, every scroll fade.
 * Static (re-generated every 5 minutes for the live counts); no client script of its own beyond the visit form and the questions.
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  const plans = marketingPlans("shop");
  return (
    // data-solo-trade="home": the landing beacon's page marker (LandingMeasure below); "/" is counted for the admin funnel (wave N).
    <div className={`mkt ${marketingFontVars} lp`} data-solo-trade="home">
      {/* 1. The promise, on the counter */}
      <section className="lp-hero" aria-labelledby="lp-title">
        <Scene />
        <div className="lp-wrap lp-hero-in">
          <div className="lp-hero-copy">
            <h1 className="lp-h1" id="lp-title">
              {L.hero.title}
            </h1>
            <p className="lp-lede">
              {L.hero.sub} <b data-testid="hero-price">{L.hero.free}</b>
            </p>
            <div className="lp-actions">
              <Primary cta="hero">{L.hero.primary}</Primary>
              <a className="lp-btn2" href="#how" data-cta="how">
                {L.hero.secondary}
              </a>
            </div>
          </div>
          <div className="lp-hero-card">
            <StampCard />
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

      {/* 3. How it works, beside the counter screen */}
      <section className="lp-sec" id="how" aria-labelledby="lp-how">
        <div className="lp-wrap lp-how">
          <div>
            <div className="lp-head lp-head-tight">
              <h2 className="lp-h2" id="lp-how">
                {L.how.title}
              </h2>
              <p className="lp-lede">{L.how.sub}</p>
            </div>
            <ol className="lp-steps">
              {L.how.steps.map((s, i) => (
                <li key={s.t}>
                  <span className="lp-step-n">{i + 1}</span>
                  <h3 className="lp-h3">{s.t}</h3>
                  <p className="lp-body">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <CounterPreview />
            <p className="lp-meta lp-caption">{L.counterCaption}</p>
          </div>
        </div>
      </section>

      {/* 4. What it does after the first stamp */}
      <section className="lp-sec" id="product" aria-labelledby="lp-product">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2 className="lp-h2" id="lp-product">
              {L.outcomes.title}
            </h2>
            <p className="lp-lede">{L.outcomes.sub}</p>
          </div>
          <ul className="lp-outcomes">
            {L.outcomes.rows
              .filter((r) => r.id !== "pass")
              .map((r) => (
                <li key={r.id} id={`outcome-${r.id}`}>
                  <h3 className="lp-h3">{r.title}</h3>
                  <p className="lp-body">{r.body}</p>
                  <ul className="lp-points">
                    {(r.id === "promos" ? [...r.points, planLine("promoAllowance")] : r.points).map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
          <div className="lp-actions lp-ctarow">
            <Primary cta="outcomes">{L.outcomes.cta}</Primary>
            <a className="lp-link" href="#pricing" data-cta="seepricing">
              {L.outcomes.pricing}
            </a>
          </div>
        </div>
      </section>

      {/* 5. Where do you fit? Four rows, each one link */}
      <section className="lp-sec" aria-label={L.router.label}>
        <div className="lp-wrap">
          <div className="lp-head">
            <h2 className="lp-h2">{L.router.title}</h2>
            <p className="lp-lede">{L.router.sub}</p>
          </div>
          <ul className="lp-doors">
            {L.router.items.map((d) => (
              <li key={d.href} className="lp-door">
                <span className="grid">
                  <span className="lp-door-t">{d.title}</span>
                  <span className="lp-door-k">{d.eyebrow}</span>
                </span>
                <span className="lp-body">{d.body}</span>
                <Link href={d.href} prefetch={false} className="lp-row-go">
                  {d.cta}
                  <ArrowRight aria-hidden strokeWidth={1.5} />
                </Link>
              </li>
            ))}
          </ul>
          <nav aria-label={copy.solo.chipsLabel} className="lp-booking">
            <span>{copy.solo.chipsLabel}</span>
            {copy.solo.chips.map((c) => (
              <Link key={c.href} href={c.href} prefetch={false}>
                {c.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* 6. Pricing: every word from lib/marketing/plan-copy.ts, every number from PLANS */}
      <section className="lp-sec" id="pricing" aria-labelledby="lp-pricing">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2 className="lp-h2" id="lp-pricing">
              {L.pricing.title}
            </h2>
            <p className="lp-lede">{f(L.pricing.sub)}</p>
          </div>
          <div className="lp-plans">
            {plans.map((p) => (
              <div key={p.key} data-plan={p.key} className={p.key === "monthly" ? "lp-plan lp-plan-pro" : "lp-plan"}>
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
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <Primary cta="pricing" quiet={p.key !== "monthly"}>
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

      {/* 8. Questions */}
      <section className="lp-sec" aria-labelledby="lp-faq">
        <div className="lp-wrap lp-faq">
          <h2 className="lp-h2" id="lp-faq">
            {L.faqTitle}
          </h2>
          <Faq className="lp-faq-list" items={L.faq.map((q) => ({ q: q.q, a: f(q.a) }))} />
        </div>
      </section>

      {/* 9. A hand getting set up */}
      <section className="lp-sec" id="book" aria-labelledby="lp-book">
        <div className="lp-wrap lp-book">
          <div>
            <h2 className="lp-h2" id="lp-book">
              {L.book.title}
            </h2>
            <p className="lp-lede">{L.book.sub}</p>
            {waUrl ? (
              <a className="lp-btn2" href={waUrl}>
                {L.book.whatsapp}
              </a>
            ) : null}
          </div>
          <div className="lp-book-form">
            <ContactForm kind="visit" />
          </div>
        </div>
      </section>

      {/* 10. The closing ask */}
      <section className="lp-final" aria-labelledby="lp-final">
        <div className="lp-wrap lp-final-in">
          <div>
            <h2 className="lp-h2" id="lp-final">
              {L.final.title}
            </h2>
            <p className="lp-body">{L.final.sub}</p>
          </div>
          <Primary cta="final">{L.final.cta}</Primary>
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
