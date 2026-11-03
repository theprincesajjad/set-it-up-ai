import type { Metadata } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import { Photo } from "@/components/marketing/landing/Photo";
import { QrCode } from "@/components/ui/QrCode";
import { COPY_B as C } from "../_landing/copy";
import { PASSES, Phone, StampAdded, WalletPass, WalletScreen } from "../_landing/Product";
import { TILE_PHOTO, TopBar, UPHOTOS, devOnly } from "../_landing/shared";
import "./b.css";

export const metadata: Metadata = { title: "Landing B: warm", robots: { index: false, follow: false } };

/**
 * Direction B, "warm and neighbourly": Newsreader (Production Type, SIL OFL 1.1) at its display size for headlines, Schibsted Grotesk
 * (Schibsted / Bakken & Bæck, SIL OFL 1.1) for text. White and black with grey bands; a bakery counter with Little Oven's rust-red
 * pass on a phone. How it works as three product panels on grey; the shop types as photos with "For the..." lines. Dev only.
 */
const serif = Newsreader({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--font-wb-serif", display: "swap" });
const sans = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-wb-sans", display: "swap" });

const P = PASSES.bakery;

export default async function LandingB() {
  await devOnly();
  return (
    <div className={`mkt ${serif.variable} ${sans.variable} wb`}>
      <TopBar cta={C.nav} prefix="wb" />
      <main id="main">
        {/* Hero: the serif promise beside a bakery counter, with the bakery's card on a phone */}
        <section className="wb-hero" aria-labelledby="wb-title">
          <div className="wb-wrap wb-hero-grid">
            <div className="wb-hero-copy">
              <h1 className="wb-h1" id="wb-title">
                <span>{C.hero.title.split(", ")[0]},</span> <em>{C.hero.title.split(", ")[1]}</em>
              </h1>
              <p className="wb-lede">{C.hero.sub}</p>
              <div className="wb-actions">
                <Link href="/signup" prefetch={false} className="wb-btn" data-cta="hero">
                  {C.hero.primary}
                </Link>
                <a href="#how" className="wb-btn wb-btn-line" data-cta="how">
                  {C.hero.secondary}
                </a>
              </div>
              <p className="wb-note">{C.hero.note}</p>
            </div>
            <div className="wb-hero-art">
              <figure className="wb-photo">
                <Photo set={UPHOTOS.bakery} alt="A baker behind her counter of bread, croissants and meringues" sizes="(min-width: 1024px) 640px, 100vw" priority />
              </figure>
              <Phone tone="wallet" className="wb-hero-phone">
                <WalletScreen data={P} />
              </Phone>
            </div>
          </div>
        </section>

        {/* How it works: three panels, each with the thing itself */}
        <section className="wb-how" id="how" aria-labelledby="wb-how">
          <div className="wb-wrap">
            <div className="wb-head">
              <h2 className="wb-h2" id="wb-how">
                {C.how.title}
              </h2>
              <p className="wb-lede">{C.how.sub}</p>
            </div>
            <ol className="wb-steps">
              <li>
                <div className="wb-panel wb-panel-pass" aria-hidden>
                  <div className="wb-panel-pass-in">
                    <WalletPass data={P} />
                  </div>
                </div>
                <span className="wb-step-n">1</span>
                <h3 className="wb-h3">{C.how.steps[0].t}</h3>
                <p className="wb-body">{C.how.steps[0].b}</p>
              </li>
              <li>
                <div className="wb-panel wb-panel-tent" aria-hidden>
                  <div className="wb-tent">
                    <span className="wb-tent-logo">{P.mono}</span>
                    <span className="wb-tent-t">Collect stamps at {P.name}</span>
                    <span className="wb-tent-qr">
                      <QrCode value="https://localloyalty.ca/j/little-oven" size={140} ecc="L" label="Join code" />
                    </span>
                    <span className="wb-tent-s">Point your camera here</span>
                  </div>
                </div>
                <span className="wb-step-n">2</span>
                <h3 className="wb-h3">{C.how.steps[1].t}</h3>
                <p className="wb-body">{C.how.steps[1].b}</p>
              </li>
              <li>
                <div className="wb-panel wb-panel-stamp" aria-hidden>
                  <StampAdded data={P} className="wb-stamp" />
                </div>
                <span className="wb-step-n">3</span>
                <h3 className="wb-h3">{C.how.steps[2].t}</h3>
                <p className="wb-body">{C.how.steps[2].b}</p>
              </li>
            </ol>
          </div>
        </section>

        {/* Shop types */}
        <section className="wb-shops" id="shops" aria-labelledby="wb-shops">
          <div className="wb-wrap">
            <div className="wb-head">
              <h2 className="wb-h2" id="wb-shops">
                {C.shops.title}
              </h2>
              <p className="wb-lede">{C.shops.sub}</p>
            </div>
            <ul className="wb-tiles">
              {C.shops.tiles.map((t) => (
                <li key={t.key} className="wb-tile">
                  <figure className="wb-tile-photo">
                    <Photo set={TILE_PHOTO[t.key]} alt="" sizes="(min-width: 1024px) 420px, 50vw" />
                  </figure>
                  <h3 className="wb-tile-t">{t.label}</h3>
                  <p className="wb-tile-line">{t.line}</p>
                </li>
              ))}
            </ul>
            <div className="wb-end">
              <Link href="/signup" prefetch={false} className="wb-btn" data-cta="shops">
                {C.shops.cta}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
