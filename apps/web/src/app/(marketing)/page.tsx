import type { Metadata } from "next";
import { BRAND } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { CardScreen, CounterMock, JoinScreen, MapScreen, PhoneFrame, StampMock, ToastMock, WalletScreen } from "@/components/marketing/Mocks";
import { MHeading, MSection } from "@/components/marketing/Section";
import { VerticalTemplates } from "@/components/marketing/VerticalTemplates";
import { copy } from "@/copy/en-CA";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: free loyalty for independent shops` },
  description: "Free forever. No transaction fees. Unlimited locations. A loyalty program for your shop, shared with every shop on your block. We set it up in 20 minutes.",
  alternates: { canonical: "/" },
};

const POS = ["Square", "Clover", "Shopify POS", "Lightspeed", "Toast"];

const FACTS = [
  { n: "$0", l: "a month, forever, for your loyalty program and its reports" },
  { n: "0%", l: "transaction fees. We never take a cut of a sale" },
  { n: "20 min", l: "to set up. A rep comes to your shop and does it with you" },
];

export default function Home() {
  return (
    <>
      {/* 1. Hero: editorial headline left, the real product right. */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 pt-14 pb-16 md:grid-cols-[1.05fr_1fr] md:px-8 md:pt-24 md:pb-28">
          <div>
            <p className="text-meta-strong text-fg-muted">For independent shops in Toronto</p>
            <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">your regulars already walk this street.</h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-fg-muted">
              A free loyalty program for your shop, shared with every shop on your block. No app to download, no fees, and we set it up with you in 20 minutes.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/signup">
                Get started free
              </Button>
              <Button size="lg" variant="secondary" href="#book" className="rounded-full!">
                Book a 20-minute visit
              </Button>
            </div>
            <p className="mt-5 text-meta text-fg-muted">{copy.misc.freeForever}</p>
          </div>
          <div className="relative mx-auto flex w-full max-w-[540px] justify-center pb-6">
            <PhoneFrame tone="map" className="relative z-[1]">
              <MapScreen />
            </PhoneFrame>
            <PhoneFrame className="-ms-14 mt-14 hidden sm:block">
              <WalletScreen />
            </PhoneFrame>
            <ToastMock className="absolute -start-2 bottom-0 z-[2] sm:-start-6">Added 1 stamp. Sam now has 8.</ToastMock>
          </div>
        </div>
      </section>

      {/* 2. Facts: plain numbers, hairlines, no cards. */}
      <section className="border-y border-line">
        <div className="mx-auto grid max-w-[1200px] divide-y divide-line px-4 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-8">
          {FACTS.map((f) => (
            <div key={f.n} className="py-8 md:px-8 md:py-12 md:first:ps-0">
              <p className="display text-mkt-md tabular-nums md:text-mkt-lg">{f.n}</p>
              <p className="mt-2 max-w-[18rem] text-body text-fg-muted">{f.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. How it works */}
      <MSection id="how">
        <div className="grid items-center gap-14 md:grid-cols-[1fr_1fr]">
          <div>
            <MHeading eyebrow="How it works" title="live on your counter this week." className="mb-10!" />
            <ol className="flex flex-col divide-y divide-line border-y border-line">
              {[
                { t: "We set you up", b: "A rep visits, picks a template for your kind of shop and prints your QR stand. About 20 minutes." },
                { t: "Customers join at the counter", b: "They scan the stand. No app, no download, 30 seconds. Or staff type their number." },
                { t: "They come back", b: "Rewards bring them back to you, and the shared card sends them to the bakery and the repair shop next door." },
              ].map((s, i) => (
                <li key={s.t} className="grid grid-cols-[48px_1fr] gap-2 py-6">
                  <span className="display text-title tabular-nums text-fg-subtle">{i + 1}</span>
                  <div>
                    <h3 className="text-headline text-fg">{s.t}</h3>
                    <p className="mt-1.5 text-body text-fg-muted">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-center gap-5">
            <PhoneFrame>
              <JoinScreen />
            </PhoneFrame>
            <PhoneFrame className="mt-16 hidden lg:block">
              <CardScreen />
            </PhoneFrame>
          </div>
        </div>
      </MSection>

      {/* 4. Counter speed */}
      <MSection tone="subtle">
        <div className="grid items-center gap-14 md:grid-cols-2">
          <MHeading eyebrow="At the counter" title="phone number, tap, done." sub="Under 5 seconds, even when the Wi-Fi isn't. Big keys, one decision per screen, and awards queue offline. Runs on any phone or tablet you already have." className="mb-0!" />
          <div className="relative flex justify-center">
            <CounterMock />
            <ToastMock className="absolute -bottom-5 start-1/2 -translate-x-1/2 whitespace-nowrap">Added 1 stamp. Sam now has 8.</ToastMock>
          </div>
        </div>
      </MSection>

      {/* 5. The network */}
      <MSection>
        <div className="grid items-center gap-14 md:grid-cols-2">
          <div className="order-2 flex justify-center md:order-1">
            <PhoneFrame tone="map">
              <MapScreen />
            </PhoneFrame>
          </div>
          <div className="order-1 md:order-2">
            <MHeading eyebrow="The network" title="one card for the whole street." sub="When someone joins at the café, they find the bakery and the repair shop too. Every shop that joins makes the card more useful for everyone's customers." className="mb-8!" />
            <ul className="flex flex-col divide-y divide-line border-y border-line text-body text-fg">
              {["Customers see every shop on the map, near them.", "Neighbourhood perks like “visit 3 shops, get 50 points”, funded by the network.", "Shops see only their own customers. Never each other's."].map((t) => (
                <li key={t} className="py-4">
                  {t}
                </li>
              ))}
            </ul>
            <Button variant="secondary" href="/neighbourhoods" className="mt-8 rounded-full!" size="lg">
              See where we are
            </Button>
          </div>
        </div>
      </MSection>

      {/* 6. Verticals */}
      <MSection tone="subtle" id="verticals">
        <MHeading eyebrow="Built for your kind of shop" title="a program that fits, ready on day one." sub="Pick your type of shop and we fill in a program that works for it. Change anything later." />
        <VerticalTemplates />
      </MSection>

      {/* 7. POS: honest about what's free today. */}
      <MSection>
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <MHeading eyebrow="Works with your counter" title="no POS? no problem." sub="The free counter app works on any phone or tablet: type a number, tap, done. Automatic points from your point of sale come with Plus, launching soon." className="mb-0!" />
          <div>
            <ul className="grid grid-cols-2 divide-x divide-y divide-line border border-line sm:grid-cols-3 [&>li]:border-line">
              {POS.map((p) => (
                <li key={p} className="flex h-20 items-center justify-center px-4 text-headline text-fg-muted">
                  {p}
                </li>
              ))}
              <li className="flex h-20 items-center justify-center px-4 text-center text-meta text-fg-muted">Webhooks & API</li>
            </ul>
            <p className="mt-3 text-meta text-fg-muted">POS auto-award, webhooks and the API are part of Plus · Coming soon</p>
          </div>
        </div>
      </MSection>

      {/* 8. Free means free */}
      <MSection tone="subtle">
        <MHeading eyebrow="Free means free" title="what you won't pay." />
        <div className="overflow-x-auto rounded-sheet border border-line bg-bg">
          <table className="w-full text-body">
            <caption className="sr-only">{BRAND.name} compared with typical loyalty apps</caption>
            <thead className="text-meta-strong text-fg-muted">
              <tr>
                <th scope="col" className="px-5 py-4 text-start md:px-8">
                  <span className="sr-only">Item</span>
                </th>
                <th scope="col" className="px-5 py-4 text-start text-fg md:px-8">
                  {BRAND.name}
                </th>
                <th scope="col" className="px-5 py-4 text-start md:px-8">
                  Typical loyalty apps
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Monthly fee", "$0", "$49–299"],
                ["Transaction fee", "0%", "Up to 5%"],
                ["Locations and staff", "Unlimited", "Per location"],
                ["Setup", "Done with you", "Do it yourself"],
              ].map(([k, us, them]) => (
                <tr key={k} className="border-t border-line">
                  <th scope="row" className="px-5 py-5 text-start font-normal text-fg-muted md:px-8">
                    {k}
                  </th>
                  <td className="display px-5 py-5 text-title text-fg md:px-8">{us}</td>
                  <td className="px-5 py-5 text-fg-muted md:px-8">{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MSection>

      {/* Testimonials: omitted until a pilot shop gives a real quote (never fake quotes). */}

      {/* 9. FAQ */}
      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <MHeading eyebrow="Questions" title="the honest answers." className="mb-0!" />
          <Faq
            items={[
              {
                q: "Is it really free?",
                a: "Yes. Your loyalty program and its reporting are free forever: points, visits or stamps, rewards, a welcome bonus, your customer list, reports, a listing on the neighbourhood map, no-download join and the wallet pass. Unlimited locations and staff, and no transaction fees.",
              },
              {
                q: "How do you make money?",
                a: "Later, with optional Plus and Pro plans for the extras: promos and bonus points, email and SMS marketing, automations, POS auto-award, order-ahead and payments, and for repair shops, tickets, quotes, deposits and invoices. They're coming soon. Your loyalty program never moves to a paid plan.",
              },
              { q: "Do I need a POS integration?", a: "No. Staff type a phone number or scan a card in the free counter app. Automatic points from Square, Clover, Shopify, Lightspeed or Toast come with Plus." },
              { q: "What about my customers' data?", a: "Your customers are yours. You see only your own members; other shops never see them. Customers only get offers if they say yes, as CASL requires." },
              { q: "Can I leave?", a: "Anytime. No contract, no setup fee." },
            ]}
          />
        </div>
      </MSection>

      {/* 10. Book a visit */}
      <MSection tone="subtle" id="book">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <MHeading eyebrow="Book a visit" title="we'll come to you." sub="A rep visits your shop, sets up your program, prints your QR stand and shows your staff the counter app. 20 minutes, free." className="mb-8!" />
            <StampMock stamps={8} goal={10} className="hidden max-w-sm md:block" />
          </div>
          <div className="rounded-sheet border border-line bg-bg p-6 md:p-8">
            <ContactForm kind="visit" />
          </div>
        </div>
      </MSection>

      {/* 11. Final CTA */}
      <MSection tone="ink">
        <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <h2 className="display max-w-3xl text-mkt-md text-balance md:text-mkt-lg">get your shop on the street&apos;s card.</h2>
          <Button size="lg" variant="inverse" href="/signup">
            Get started free
          </Button>
        </div>
      </MSection>
    </>
  );
}
