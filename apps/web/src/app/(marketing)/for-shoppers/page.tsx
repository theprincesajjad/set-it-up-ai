import { Lock, MapPin, ShieldCheck, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { Faq } from "@/components/marketing/Faq";
import { NetworkMapIllustration, StepIllustration } from "@/components/marketing/Illustrations";
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
      <MSection>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="font-display text-[40px] font-semibold leading-[44px] text-fg md:text-hero">{copy.misc.joinTagline}</h1>
            <p className="mt-5 text-body-lg text-fg-muted">Earn rewards at the local places you already love. Free, and your points never expire.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/map" iconStart={MapPin}>
                Find shops near me
              </Button>
              <Button size="lg" variant="secondary" href={env.appStoreUrl} iconStart={Smartphone}>
                App Store
              </Button>
              <Button size="lg" variant="secondary" href={env.playStoreUrl} iconStart={Smartphone}>
                Google Play
              </Button>
            </div>
            <p className="mt-4 text-caption text-fg-muted">Or just scan the QR at any participating shop.</p>
          </div>
          <NetworkMapIllustration className="w-full" />
        </div>
      </MSection>

      <MSection tone="subtle">
        <MHeading eyebrow="How it works" title="Three steps, no app needed" />
        <ol className="grid gap-6 md:grid-cols-3">
          {[
            { k: "join" as const, t: "Scan or give your number", b: "Scan the QR on the counter, or tell staff your number. Takes 30 seconds." },
            { k: "return" as const, t: "Earn", b: "Points or stamps at every shop you visit, all on one card." },
            { k: "setup" as const, t: "Get rewards", b: "Free coffee, $5 off, a free cut. Each shop sets its own, and they never expire." },
          ].map((s, i) => (
            <li key={s.t} className="rounded-xl bg-surface p-6 shadow-sm">
              <StepIllustration kind={s.k} className="h-24 w-32" />
              <p className="mt-4 text-overline uppercase text-fg-muted">Step {i + 1}</p>
              <h3 className="mt-1 text-h3 text-fg">{s.t}</h3>
              <p className="mt-2 text-body text-fg-muted">{s.b}</p>
            </li>
          ))}
        </ol>
      </MSection>

      {hoods.length ? (
        <MSection>
          <MHeading eyebrow="Live now" title="Where your card works" />
          <ul className="flex flex-wrap gap-3">
            {hoods.map((h) => (
              <li key={h.slug}>
                <Link href={`/neighbourhoods/${h.slug}`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-surface px-5 text-label text-fg shadow-sm hover:shadow-md focus-visible:focus-ring">
                  <MapPin aria-hidden className="size-4 text-fg-brand" />
                  {h.name} · {h.shopCount} shops
                </Link>
              </li>
            ))}
          </ul>
        </MSection>
      ) : null}

      <MSection tone="subtle">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Shops see only their own customers", b: "The café never sees what you bought at the bookstore." },
            { icon: Lock, t: "We never sell your data", b: "Not to advertisers, not to anyone. Delete your account anytime." },
            { icon: Smartphone, t: "Offers only if you say yes", b: "Each shop asks separately. Reply STOP to any text to stop." },
          ].map((b) => (
            <div key={b.t} className="rounded-xl bg-surface p-6 shadow-sm">
              <b.icon aria-hidden className="size-6 text-fg-brand" />
              <h3 className="mt-3 text-title text-fg">{b.t}</h3>
              <p className="mt-1 text-body text-fg-muted">{b.b}</p>
            </div>
          ))}
        </div>
      </MSection>

      <MSection>
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-h2 text-fg">Questions</h2>
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
