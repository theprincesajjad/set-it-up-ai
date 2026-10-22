import { Check, Plug, Timer, X } from "lucide-react";
import type { Metadata } from "next";
import { BRAND } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { NetworkMapIllustration, StepIllustration, StreetIllustration } from "@/components/marketing/Illustrations";
import { MHeading, MSection } from "@/components/marketing/Section";
import { VerticalTemplates } from "@/components/marketing/VerticalTemplates";
import { Wordmark } from "@/components/site/Brand";
import { copy } from "@/copy/en-CA";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: free loyalty for independent shops` },
  description: "Free forever. No transaction fees. Unlimited locations. A loyalty program for your shop, shared with every shop on your block. We set it up in 20 minutes.",
  alternates: { canonical: "/" },
};

const POS = ["Square", "Clover", "Shopify POS", "Lightspeed", "Toast"];

export default function Home() {
  return (
    <>
      {/* 1. Hero */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-12 md:grid-cols-[1.1fr_1fr] md:px-8 md:py-24">
          <div>
            <p className="text-overline uppercase text-fg-brand">For independent shops in Toronto</p>
            <h1 className="mt-3 font-display text-[40px] font-semibold leading-[44px] tracking-[-0.02em] text-fg md:text-hero">Your regulars already walk this street.</h1>
            <p className="mt-5 max-w-xl text-body-lg text-fg-muted">
              A free loyalty program for your shop, shared with every shop on your block. We set it up for you in 20 minutes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/signup">
                Get started free
              </Button>
              <Button size="lg" variant="secondary" href="#book">
                Book a 20-minute visit
              </Button>
            </div>
            <p className="mt-4 text-caption text-fg-muted">{copy.misc.freeForever}</p>
          </div>
          <div className="relative">
            <StreetIllustration className="w-full" />
            <div className="absolute -bottom-6 end-4 w-56 rounded-xl bg-success p-4 text-on-success shadow-lg md:end-8">
              <p className="text-overline uppercase opacity-90">Counter</p>
              <p className="text-h3">Added 1 stamp</p>
              <p className="text-body-sm tabular-nums">Sam now has 9 / 10</p>
            </div>
          </div>
        </div>
      </section>

      {/* Big promise band */}
      <MSection tone="subtle" className="!py-10">
        <p className="text-center font-display text-[28px] font-semibold leading-9 text-fg md:text-display">Free forever. No transaction fees. Unlimited locations.</p>
      </MSection>

      {/* 2. How it works */}
      <MSection id="how">
        <MHeading eyebrow="How it works" title="Live on your counter this week" />
        <ol className="grid gap-6 md:grid-cols-3">
          {[
            { k: "setup" as const, t: "We set you up", b: "A rep visits, picks a template for your type of shop and prints your QR stand. About 20 minutes." },
            { k: "join" as const, t: "Customers join at the counter", b: "They scan the stand. No app, no download, 30 seconds. Or staff type their number." },
            { k: "return" as const, t: "They come back", b: "Rewards bring them back to you, and the shared card sends them to the bakery and the repair shop next door." },
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

      {/* 3. Counter speed */}
      <MSection tone="subtle">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <MHeading eyebrow="At the counter" title="Phone number, tap, done." sub="Under 5 seconds, even when the Wi-Fi isn't. Big buttons, one decision per screen, and awards queue offline." />
          </div>
          <div className="mx-auto w-full max-w-sm rounded-xl bg-surface p-6 shadow-md">
            <div className="flex items-center gap-2 text-label text-fg-muted">
              <Timer aria-hidden className="size-4" /> 3 seconds
            </div>
            <p className="mt-3 rounded-md bg-surface-sunken px-4 py-3 text-h3 tabular-nums text-fg">(416) 555-0123</p>
            <div className="mt-3 rounded-lg bg-brand px-4 py-4 text-center text-title text-on-brand">Add stamp</div>
            <p className="mt-3 text-center text-body-sm text-fg-muted">Added 1 stamp. Sam now has 8.</p>
          </div>
        </div>
      </MSection>

      {/* 4. The network */}
      <MSection>
        <div className="grid items-center gap-10 md:grid-cols-2">
          <NetworkMapIllustration className="w-full" />
          <div>
            <MHeading eyebrow="The network effect" title="One card for the whole street." sub="When someone joins at the café, they discover the bakery and the repair shop too. Every shop that joins makes the card more useful for everyone's customers." />
            <ul className="flex flex-col gap-3 text-body text-fg">
              {["Customers see every shop on the map, near them.", "Neighbourhood perks like “visit 3 shops, get 50 points”, funded by us.", "Shops see only their own customers. Never each other's."].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
            <Button variant="ghost" href="/neighbourhoods" className="mt-6 -ms-4">
              See where we are
            </Button>
          </div>
        </div>
      </MSection>

      {/* 5. Verticals */}
      <MSection tone="subtle" id="verticals">
        <MHeading eyebrow="Built for your kind of shop" title="A program that fits, ready on day one" sub="Pick your type of shop and we fill in a program that works for it. Change anything later." />
        <VerticalTemplates />
      </MSection>

      {/* POS connectors */}
      <MSection>
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <MHeading eyebrow="Works with your POS" title="Points on every sale, automatically" sub="Connect your point of sale and customers earn when they pay. No POS? The free counter app works on any phone or tablet." />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {POS.map((p) => (
              <li key={p} className="flex min-h-16 items-center gap-2 rounded-lg bg-surface px-4 text-title text-fg shadow-sm">
                <Plug aria-hidden className="size-5 text-fg-brand" />
                {p}
              </li>
            ))}
            <li className="flex min-h-16 items-center rounded-lg border border-dashed border-border-strong px-4 text-body-sm text-fg-muted">Webhooks & API for the rest</li>
          </ul>
        </div>
      </MSection>

      {/* 6. Free means free */}
      <MSection tone="subtle">
        <MHeading eyebrow="Free means free" title="What you won't pay" center />
        <div className="mx-auto max-w-3xl overflow-x-auto rounded-xl bg-surface shadow-sm">
          <table className="w-full text-body">
            <caption className="sr-only">{BRAND.name} compared with typical loyalty apps</caption>
            <thead className="bg-surface-sunken text-label text-fg-muted">
              <tr>
                <th scope="col" className="p-4 text-start">
                  <span className="sr-only">Item</span>
                </th>
                <th scope="col" className="p-4 text-start text-fg-brand">
                  {BRAND.name}
                </th>
                <th scope="col" className="p-4 text-start">
                  Typical loyalty apps
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Monthly fee", "$0", "$49–299"],
                ["Transaction fee", "0%", "Up to 5%"],
                ["Locations", "Unlimited", "Per location"],
                ["Setup", "Done for you", "Do it yourself"],
              ].map(([k, us, them]) => (
                <tr key={k} className="border-t border-border">
                  <th scope="row" className="p-4 text-start font-semibold text-fg">
                    {k}
                  </th>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-2 font-semibold text-fg">
                      <Check aria-hidden className="size-5 text-success" /> {us}
                    </span>
                  </td>
                  <td className="p-4 text-fg-muted">
                    <span className="inline-flex items-center gap-2">
                      <X aria-hidden className="size-5" /> {them}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MSection>

      {/* 7. Testimonials: omitted until a pilot shop gives a real quote (never fake quotes). */}

      {/* 8. FAQ */}
      <MSection>
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <MHeading eyebrow="Questions" title="The honest answers" />
          <Faq
            items={[
              { q: "Is it really free?", a: "Yes. Every loyalty feature is free forever: points, stamps, rewards, promos, discount cards, unlimited staff and locations, and no transaction fees." },
              {
                q: "How do you make money?",
                a: "Later, optional paid tools like order-ahead and repair approvals, plus sponsored spots shops can choose to buy. They're always labelled. Loyalty never moves to a paid plan.",
              },
              { q: "Do I need a POS integration?", a: "No. Staff can type a phone number or scan a card in the free counter app. If you use Square, Clover, Shopify, Lightspeed or Toast, you can connect it so points are awarded automatically." },
              { q: "What about my customers' data?", a: "Your customers are yours. You see only your own members; other shops never see them. Customers only get offers if they say yes, as CASL requires." },
              { q: "Can I leave?", a: "Anytime. Export everything as CSV from your dashboard." },
            ]}
          />
        </div>
      </MSection>

      {/* Book a visit */}
      <MSection tone="subtle" id="book">
        <div className="grid gap-10 md:grid-cols-2">
          <MHeading eyebrow="Book a visit" title="We'll come to you" sub="A rep visits your shop, sets up your program, prints your QR stand and shows your staff the counter app. 20 minutes, free." />
          <div className="rounded-xl bg-surface p-6 shadow-sm">
            <ContactForm kind="visit" />
          </div>
        </div>
      </MSection>

      {/* 9. Final CTA */}
      <section className="bg-brand py-16 text-on-brand md:py-24">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-4 text-center md:px-8">
          <Wordmark inverse href={null} />
          <h2 className="font-display text-[32px] font-semibold leading-[38px] md:text-display">Get your shop on the street&apos;s card.</h2>
          <Button size="lg" variant="inverse" href="/signup">
            Get started free
          </Button>
        </div>
      </section>
    </>
  );
}
