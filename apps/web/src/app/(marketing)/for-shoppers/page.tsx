import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { Faq } from "@/components/marketing/Faq";
import { CardScreen, MapScreen, PhoneFrame, WalletScreen } from "@/components/marketing/Mocks";
import { MHeading, MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { env } from "@/lib/env";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "For shoppers",
  description: "One card for every shop on your street. Earn rewards at the local places you already love. Free, and your points never expire.",
  alternates: { canonical: "/for-shoppers" },
};

export default async function ShoppersPage() {
  let hoods: { slug: string; name: string; shopCount: number }[] = [];
  try {
    hoods = (await publicServerApi().network.neighbourhoods()).items;
  } catch {
    hoods = [];
  }
  return (
    <>
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 pt-14 pb-16 md:grid-cols-[1.05fr_1fr] md:px-8 md:pt-24 md:pb-28">
          <div>
            <p className="text-meta-strong text-fg-muted">For shoppers</p>
            <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">{copy.misc.joinTagline.toLowerCase()}</h1>
            <p className="mt-6 max-w-[32rem] text-[18px] leading-[1.55] text-fg-muted">Earn rewards at the local places you already love. Free, no app needed, and your points never expire.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/map">
                Find shops near me
              </Button>
              <Button size="lg" variant="secondary" href="/me">
                My card
              </Button>
            </div>
            <p className="mt-5 text-meta text-fg-muted">
              Or scan the QR at any participating shop. Prefer an app?{" "}
              <a href={env.appStoreUrl} className="font-semibold text-fg underline decoration-line-strong/60 underline-offset-2">
                App Store
              </a>{" "}
              ·{" "}
              <a href={env.playStoreUrl} className="font-semibold text-fg underline decoration-line-strong/60 underline-offset-2">
                Google Play
              </a>
            </p>
          </div>
          <div className="relative mx-auto flex w-full max-w-[540px] justify-center">
            <PhoneFrame className="relative z-[1]">
              <WalletScreen />
            </PhoneFrame>
            <PhoneFrame className="-ms-14 mt-14 hidden sm:block">
              <CardScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      <MSection tone="subtle">
        <MHeading eyebrow="How it works" title="three steps, no app needed." />
        <ol className="grid gap-px overflow-hidden rounded-sheet border border-line bg-line md:grid-cols-3">
          {[
            { t: "Scan or give your number", b: "Scan the QR on the counter, or tell staff your number. Takes 30 seconds." },
            { t: "Earn everywhere", b: "Points or stamps at every shop you visit, all on one card." },
            { t: "Get rewards", b: "Free coffee, $5 off, a free cut. Each shop sets its own, and they never expire." },
          ].map((s, i) => (
            <li key={s.t} className="bg-bg p-6 md:p-8">
              <span className="display text-mkt-sm tabular-nums text-fg-subtle">{i + 1}</span>
              <h3 className="mt-6 text-headline text-fg">{s.t}</h3>
              <p className="mt-2 text-body text-fg-muted">{s.b}</p>
            </li>
          ))}
        </ol>
      </MSection>

      <MSection>
        <div className="grid items-center gap-14 md:grid-cols-2">
          <div>
            <MHeading eyebrow="Live now" title="where your card works." sub="Every participating shop is on the map. Neighbourhood perks reward you for trying the place next door." className="mb-8!" />
            {hoods.length ? (
              <ul className="flex flex-wrap gap-2">
                {hoods.map((h) => (
                  <li key={h.slug}>
                    <Link href={`/neighbourhoods/${h.slug}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-meta-strong text-fg transition-colors hover:bg-bg-subtle focus-visible:focus-ring">
                      <span className="display lowercase">{h.name}</span>
                      <span className="font-normal tabular-nums text-fg-muted">{h.shopCount} shops</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="flex justify-center">
            <PhoneFrame tone="map">
              <MapScreen />
            </PhoneFrame>
          </div>
        </div>
      </MSection>

      <MSection tone="subtle">
        <MHeading eyebrow="Your data" title="private by default." />
        <div className="grid gap-px overflow-hidden rounded-sheet border border-line bg-line md:grid-cols-3">
          {[
            { t: "Shops see only their own customers", b: "The café never sees what you bought at the bookstore." },
            { t: "We never sell your data", b: "Not to advertisers, not to anyone. Delete your account anytime." },
            { t: "Offers only if you say yes", b: "Each shop asks separately. Reply STOP to any text to stop." },
          ].map((b) => (
            <div key={b.t} className="bg-bg p-6 md:p-8">
              <h3 className="text-headline text-fg">{b.t}</h3>
              <p className="mt-2 text-body text-fg-muted">{b.b}</p>
            </div>
          ))}
        </div>
      </MSection>

      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <h2 className="display text-mkt-md md:text-mkt-lg">questions.</h2>
          <Faq
            items={[
              { q: "Does it cost anything?", a: "No. It's free for you, always." },
              { q: "Do I need the app?", a: `No. Scan the QR at the counter and you're in. You can add your card to Apple Wallet or Google Wallet, or get the ${BRAND.name} app later.` },
              { q: "Do my points expire?", a: "No, unless a shop turns on expiry. If it does, the rule is shown next to your balance." },
              { q: "Can I use points from one shop at another?", a: "Points stay at the shop where you earned them. Neighbourhood bonuses reward you for visiting more shops on the street." },
              { q: "How do I stop texts?", a: "Reply STOP to any message, or change it per shop in Settings on your card." },
            ]}
          />
        </div>
      </MSection>
    </>
  );
}
