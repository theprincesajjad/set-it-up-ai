import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Photo } from "@/components/marketing/landing/Photo";
import { COPY_A as C } from "../_landing/copy";
import { PASSES, Phone, StampAdded, StampToast, WalletPass, WeeklyCard } from "../_landing/Product";
import { TILE_PHOTO, TopBar, UPHOTOS, devOnly } from "../_landing/shared";
import "./a.css";

export const metadata: Metadata = { title: "Landing A: direct", robots: { index: false, follow: false } };

/**
 * Direction A, "direct": General Sans (Indian Type Foundry, ITF Free Font License, self-hosted from Fontshare) at 600 for headlines
 * and 400/500 for text. Square-hard black and white, one huge line, a café photo across the page with Pinecone Coffee's green pass on
 * it. How it works on a black band beside a nail studio's counter; the shop types as six photo tiles. Dev only (shared.tsx devOnly).
 */
const generalSans = localFont({
  src: [
    { path: "../_landing/fonts/GeneralSans-Regular.woff2", weight: "400" },
    { path: "../_landing/fonts/GeneralSans-Medium.woff2", weight: "500" },
    { path: "../_landing/fonts/GeneralSans-Semibold.woff2", weight: "600" },
  ],
  variable: "--font-wa",
  display: "swap",
});

export default async function LandingA() {
  await devOnly();
  return (
    <div className={`mkt ${generalSans.variable} wa`}>
      <TopBar cta={C.nav} prefix="wa" />
      <main id="main">
        {/* Hero: one huge line, the sub and the asks, then the café across the page with its pass */}
        <section className="wa-hero" aria-labelledby="wa-title">
          <div className="wa-wrap">
            <h1 className="wa-h1" id="wa-title">
              {C.hero.title}
            </h1>
            <div className="wa-hero-row">
              <p className="wa-lede">
                {C.hero.sub} <b>{C.hero.free}</b>
              </p>
              <div className="wa-hero-act">
                <div className="wa-actions">
                  <Link href="/signup" prefetch={false} className="wa-btn" data-cta="hero">
                    {C.hero.primary}
                  </Link>
                  <a href="#how" className="wa-btn wa-btn-line" data-cta="how">
                    {C.hero.secondary}
                  </a>
                </div>
                <p className="wa-note">{C.hero.note}</p>
              </div>
            </div>
            <div className="wa-stage">
              <figure className="wa-photo">
                <Photo set={UPHOTOS.pour} mobile={UPHOTOS.pourMobile} alt="A barista pouring milk into cups at a neighbourhood café" sizes="(min-width: 1440px) 1320px, 100vw" priority />
              </figure>
              <div className="wa-pass-wrap">
                <StampToast data={PASSES.cafe} className="wa-toast" />
                <WalletPass data={PASSES.cafe} className="wa-pass" />
              </div>
            </div>
          </div>
        </section>

        {/* How it works: three steps on black, beside a counter with the stamp moment on a phone */}
        <section className="wa-how" id="how" aria-labelledby="wa-how">
          <div className="wa-wrap wa-how-grid">
            <div className="wa-how-copy">
              <h2 className="wa-h2" id="wa-how">
                {C.how.title.split(/(?<=\.) /).map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </h2>
              <p className="wa-lede wa-lede-dark">{C.how.sub}</p>
              <ol className="wa-steps">
                {C.how.steps.map((s, i) => (
                  <li key={s.t}>
                    <span className="wa-step-n" aria-hidden>
                      {i + 1}
                    </span>
                    <h3 className="wa-h3">{s.t}</h3>
                    <p>{s.b}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="wa-how-art">
              <figure className="wa-how-photo">
                <Photo set={UPHOTOS.counter} alt="A nail studio owner at her counter with a tablet, talking to a customer" sizes="(min-width: 1024px) 600px, 100vw" />
              </figure>
              <Phone className="wa-how-phone">
                <StampAdded data={PASSES.nails} bare />
              </Phone>
              <WeeklyCard className="wa-how-week" total={38} change={9} />
            </div>
          </div>
        </section>

        {/* Shop types: six photo tiles with a label pill and one line */}
        <section className="wa-shops" id="shops" aria-labelledby="wa-shops">
          <div className="wa-wrap">
            <div className="wa-shops-head">
              <div>
                <h2 className="wa-h2" id="wa-shops">
                  {C.shops.title}
                </h2>
                <p className="wa-lede">{C.shops.sub}</p>
              </div>
              <Link href="/signup" prefetch={false} className="wa-btn" data-cta="shops">
                {C.shops.cta}
                <ArrowRight aria-hidden />
              </Link>
            </div>
            <ul className="wa-tiles">
              {C.shops.tiles.map((t) => (
                <li key={t.key} className="wa-tile">
                  <figure className="wa-tile-photo">
                    <Photo set={TILE_PHOTO[t.key]} alt="" sizes="(min-width: 1024px) 420px, 50vw" />
                    <figcaption className="wa-tag">{t.label}</figcaption>
                  </figure>
                  <p className="wa-tile-line">{t.line}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
