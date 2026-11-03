import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, FEES } from "@ll/shared";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { LiveProof } from "@/components/marketing/LiveProof";
import { TradeMarquee } from "@/components/marketing/TradeMarquee";
import { PHOTOS, Photo, type PhotoSet } from "@/components/marketing/landing/Photo";
import "@/components/marketing/landing/landing.css";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { copy } from "@/copy/en-CA";
import { marketingFontVars } from "@/lib/marketing/fonts";
import { marketingPlans, planLine, planNote, planVars } from "@/lib/marketing/plan-copy";
import { fill } from "@/lib/marketing/text";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

export const revalidate = 300;

const L = copy.landing;
const PH = L.photos;

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: ${L.meta.title}` },
  description: L.meta.description,
  alternates: { canonical: "/" },
};

/** Plan and fee fills for the home copy: names and prices from lib/marketing/plan-copy.ts (PLANS), the order fee from FEES. */
const VARS = { ...planVars(), orderFee: Number((FEES.orderBpsFree / 100).toFixed(2)) };
const f = (s: string) => fill(s, VARS);

/**
 * Every ask on the page goes to the sign-up entry and carries its data-cta (the funnel counts them). Black pill by default; `outline`
 * is the white pill with a black hairline; `white` is the white pill used on the black bands.
 */
function Primary({ cta, children, tone = "black" }: { cta: string; children: React.ReactNode; tone?: "black" | "outline" | "white" }) {
  return (
    <Link href="/signup" prefetch={false} className={`lp-btn lp-btn-${tone}`} data-cta={cta}>
      {children}
    </Link>
  );
}

/** A photo in a rounded frame with its trade on a black pill (Square's caption pill). The frame sets the aspect; the photo covers it. */
function Framed({ set, mobile, alt, tag, sizes, priority, className }: { set: PhotoSet; mobile?: PhotoSet; alt: string; tag?: string; sizes: string; priority?: boolean; className?: string }) {
  return (
    <figure className={`lp-frame ${className ?? ""}`}>
      <Photo set={set} mobile={mobile} alt={alt} sizes={sizes} priority={priority} />
      {tag ? (
        <figcaption className="lp-tag" aria-hidden>
          {tag}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** The outcome rows' photos (week, promos, map) and the four doors' photos, in copy order. */
const OUTCOME_PHOTO = { week: ["barber", PH.barber], promos: ["cafePour", PH.cafePour], map: ["cornerStore", PH.cornerStore] } as const;
const DOOR_PHOTO = [
  ["retail", PH.retail],
  ["nails", PH.nails],
  ["bakery", PH.bakery],
  ["street", PH.street],
] as const;

/**
 * The home page, wave T: in the manner of squareup.com, after the founder turned down four homemade looks (template SaaS, beige paper,
 * pastel blocks, a hand-drawn main street). Black and white, Inter Tight headlines, real photos of neighbourhood businesses (Unsplash,
 * credits in public/marketing/photos/CREDITS.md) in rounded frames, and real screenshots of the app (a customer's wallet, the counter,
 * the owner's Today screen; sample data) laid over or beside them. No illustrations, no tints, almost no motion.
 * Order (e2e/marketing-bia.spec.ts): the promise beside a café with a customer's wallet over it, live counts and trades, how it works
 * beside a repair bench with the counter over it, what it does on the black band (Today, then three outcomes with photos), where you
 * fit as four photo cards, the plans on the grey band, the dated comparison, questions, a visit, the closing black band.
 * Static (re-generated every 5 minutes for the live counts); no client script of its own beyond the visit form and the questions.
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  const plans = marketingPlans("shop");
  const rows = L.outcomes.rows.filter((r) => r.id !== "pass");
  return (
    // data-solo-trade="home": the landing beacon's page marker (LandingMeasure below); "/" is counted for the admin funnel (wave N).
    <div className={`mkt ${marketingFontVars} lp`} data-solo-trade="home">
      {/* 1. The promise: headline and the two asks; a café counter with a customer's real wallet over it */}
      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <h1 className="lp-h1" id="lp-title">
              {L.hero.title}
            </h1>
            <p className="lp-lede">
              {L.hero.sub} <b data-testid="hero-price">{L.hero.free}</b>
            </p>
            <div className="lp-actions">
              <Primary cta="hero">{L.hero.primary}</Primary>
              <a className="lp-btn lp-btn-outline" href="#how" data-cta="how">
                {L.hero.secondary}
              </a>
            </div>
            <ul className="lp-trust">
              {L.heroTrust.split(" · ").map((t) => (
                <li key={t}>
                  <Check aria-hidden strokeWidth={2.5} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-hero-art">
            <Framed set={PHOTOS.cafe} mobile={PHOTOS.cafeMobile} alt={PH.cafe.alt} tag={PH.cafe.tag} sizes="(min-width: 1024px) 58vw, 100vw" priority className="lp-hero-photo" />
            <figure className="lp-shot lp-hero-pass">
              <Photo set={PHOTOS.pass} alt={L.shots.pass} sizes="(min-width: 1024px) 280px, 46vw" />
            </figure>
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

      {/* 3. How it works: three steps beside a repair bench, with the real counter screen over it */}
      <section className="lp-sec" id="how" aria-labelledby="lp-how">
        <div className="lp-wrap lp-split">
          <div className="lp-split-copy">
            <h2 className="lp-h2" id="lp-how">
              {L.how.title}
            </h2>
            <p className="lp-lede">{L.how.sub}</p>
            <ol className="lp-steps">
              {L.how.steps.map((s, i) => (
                <li key={s.t}>
                  <span className="lp-step-n" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="lp-h3">{s.t}</h3>
                  <p className="lp-body">{s.b}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="lp-split-art lp-how-art">
            <Framed set={PHOTOS.repair} alt={PH.repair.alt} tag={PH.repair.tag} sizes="(min-width: 1024px) 46vw, 100vw" className="lp-how-photo" />
            <figure className="lp-shot lp-how-counter">
              <Photo set={PHOTOS.counter} alt={L.shots.counter} sizes="(min-width: 1024px) 40vw, 92vw" />
            </figure>
            <p className="lp-caption">{L.counterCaption}</p>
          </div>
        </div>
      </section>

      {/* 4. What it does after the first stamp, on the black band: the real Today screen, then three outcomes with their photos */}
      <section className="lp-sec lp-dark" id="product" aria-labelledby="lp-product">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2 className="lp-h2" id="lp-product">
              {L.outcomes.title}
            </h2>
            <p className="lp-lede">{L.outcomes.sub}</p>
          </div>
          <figure className="lp-shot lp-today">
            <Photo set={PHOTOS.today} mobile={PHOTOS.todayMobile} alt={L.shots.today} sizes="(min-width: 1360px) 1280px, 94vw" />
          </figure>
          <p className="lp-caption">{L.shots.note}</p>
          <ul className="lp-outcomes">
            {rows.map((r) => {
              const [key, ph] = OUTCOME_PHOTO[r.id as keyof typeof OUTCOME_PHOTO];
              return (
                <li key={r.id} id={`outcome-${r.id}`} className="lp-outcome">
                  <Framed set={PHOTOS[key]} alt={ph.alt} tag={ph.tag} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
                  <h3 className="lp-h3">{r.title}</h3>
                  <p className="lp-body">{r.body}</p>
                  <ul className="lp-points">
                    {(r.id === "promos" ? [...r.points, planLine("promoAllowance")] : r.points).map((p) => (
                      <li key={p}>
                        <Check aria-hidden strokeWidth={2.5} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div className="lp-actions">
            <Primary cta="outcomes" tone="white">
              {L.outcomes.cta}
            </Primary>
            <a className="lp-link" href="#pricing" data-cta="seepricing">
              {L.outcomes.pricing}
              <ArrowRight aria-hidden strokeWidth={2} />
            </a>
          </div>
        </div>
      </section>

      {/* 5. Where do you fit? Four photo cards, each one link (the whole card is the target), then the booking trades */}
      <section className="lp-sec" aria-label={L.router.label}>
        <div className="lp-wrap">
          <div className="lp-head">
            <h2 className="lp-h2">{L.router.title}</h2>
            <p className="lp-lede">{L.router.sub}</p>
          </div>
          <ul className="lp-doors">
            {L.router.items.map((d, i) => {
              const [key, ph] = DOOR_PHOTO[i]!;
              return (
                <li key={d.href} className="lp-door">
                  <Framed set={PHOTOS[key]} alt={ph.alt} tag={ph.tag} sizes="(min-width: 1100px) 23vw, (min-width: 640px) 46vw, 100vw" />
                  <div className="lp-door-body">
                    <span className="lp-door-k">{d.eyebrow}</span>
                    <span className="lp-door-t">{d.title}</span>
                    <span className="lp-body">{d.body}</span>
                    <Link href={d.href} prefetch={false} className="lp-row-go">
                      {d.cta}
                      <ArrowRight aria-hidden strokeWidth={2} />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
          <nav aria-label={copy.solo.chipsLabel} className="lp-booking">
            <span>{copy.solo.chipsLabel}</span>
            {copy.solo.chips.map((c) => (
              <Link key={c.href} href={c.href} prefetch={false}>
                {c.label}
                <ArrowRight aria-hidden strokeWidth={2} />
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* 6. Pricing on the grey band: every word from lib/marketing/plan-copy.ts, every number from PLANS; Pro is the black card */}
      <section className="lp-sec lp-grey" id="pricing" aria-labelledby="lp-pricing">
        <div className="lp-wrap">
          <div className="lp-head">
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
                <span className="lp-plan-tag">{p.tagline}</span>
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
                <Primary cta="pricing" tone={p.key === "monthly" ? "white" : "outline"}>
                  {p.cta}
                </Primary>
                <ul>
                  {p.features.map((x) => (
                    <li key={x}>
                      <Check aria-hidden strokeWidth={2.5} />
                      {x}
                    </li>
                  ))}
                </ul>
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

      {/* 8. Questions: the heading beside the hairline list */}
      <section className="lp-sec lp-sec-top0" aria-labelledby="lp-faq">
        <div className="lp-wrap lp-faq">
          <h2 className="lp-h2" id="lp-faq">
            {L.faqTitle}
          </h2>
          <Faq className="lp-faq-list" items={L.faq.map((q) => ({ q: q.q, a: f(q.a) }))} />
        </div>
      </section>

      {/* 9. A hand getting set up, on the grey band: a counter photo beside the visit form */}
      <section className="lp-sec lp-grey" id="book" aria-labelledby="lp-book">
        <div className="lp-wrap lp-book">
          <div className="lp-book-copy">
            <h2 className="lp-h2" id="lp-book">
              {L.book.title}
            </h2>
            <p className="lp-lede">{L.book.sub}</p>
            {waUrl ? (
              <a className="lp-btn lp-btn-outline" href={waUrl}>
                {L.book.whatsapp}
              </a>
            ) : null}
            <Framed set={PHOTOS.counterHelp} alt={PH.counterHelp.alt} tag={PH.counterHelp.tag} sizes="(min-width: 1024px) 40vw, 100vw" className="lp-book-photo" />
          </div>
          <div className="lp-book-form">
            <ContactForm kind="visit" />
          </div>
        </div>
      </section>

      {/* 10. The closing ask, on the black band */}
      <section className="lp-final lp-dark" aria-labelledby="lp-final">
        <div className="lp-wrap lp-final-in">
          <h2 className="lp-h2 lp-h2-xl" id="lp-final">
            {L.final.title}
          </h2>
          <p className="lp-lede">{L.final.sub}</p>
          <Primary cta="final" tone="white">
            {L.final.cta}
          </Primary>
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
