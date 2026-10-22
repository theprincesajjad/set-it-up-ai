import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/ContactForm";
import { MHeading, MSection } from "@/components/marketing/Section";
import { StampMock } from "@/components/marketing/Mocks";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "For BIAs",
  description: "Proof that your street events bring people in. Run a neighbourhood points weekend or passport through one app your shops already use.",
  alternates: { canonical: "/for-bias" },
};

const DAYS = ["Fri", "Sat", "Sun"];
const SHOPS = [
  { name: "Café", v: [18, 42, 37] },
  { name: "Bakery", v: [22, 51, 44] },
  { name: "Books", v: [9, 26, 21] },
  { name: "Florist", v: [6, 19, 15] },
];

const BEFORE = [12, 15, 6, 4];

/** Example report: event weekend in black, the weekend before in grey. Decorative chart; the table carries the data. */
function MockReport() {
  const max = 140;
  const totals = SHOPS.map((s) => s.v.reduce((a, b) => a + b, 0));
  return (
    <figure className="rounded-sheet border border-line bg-bg p-6 md:p-8">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-headline text-fg">Visits per shop</span>
        <span className="text-meta text-fg-muted">Passport weekend</span>
      </figcaption>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="display text-mkt-md tabular-nums">{totals.reduce((a, b) => a + b, 0)}</span>
        <span className="text-meta text-fg-muted">visits, vs {BEFORE.reduce((a, b) => a + b, 0) * 3} the weekend before</span>
      </div>
      <svg viewBox="0 0 320 150" className="mt-6 w-full" aria-hidden>
        {[0, 1, 2].map((i) => (
          <line key={i} x1="0" x2="320" y1={10 + i * 60} y2={10 + i * 60} className="stroke-chart-grid" strokeWidth="1" />
        ))}
        {SHOPS.map((s, i) => {
          const h = (totals[i]! / max) * 130;
          const hb = ((BEFORE[i]! * 3) / max) * 130;
          const x = i * 80 + 14;
          return (
            <g key={s.name}>
              <rect x={x} y={140 - hb} width="22" height={hb} rx="3" className="fill-bg-muted" />
              <rect x={x + 26} y={140 - h} width="22" height={h} rx="3" className="fill-fg" />
              <text x={x + 24} y="150" textAnchor="middle" className="fill-fg-muted" fontSize="9">
                {s.name.toLowerCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="mt-6 w-full text-meta">
        <caption className="sr-only">Visits per shop per day</caption>
        <thead>
          <tr className="text-fg-muted">
            <th scope="col" className="pb-2 text-start font-normal">
              Shop
            </th>
            {DAYS.map((d) => (
              <th key={d} scope="col" className="pb-2 text-end font-normal">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHOPS.map((s) => (
            <tr key={s.name} className="border-t border-line">
              <th scope="row" className="py-2 text-start font-normal text-fg">
                {s.name}
              </th>
              {s.v.map((v, i) => (
                <td key={i} className="py-2 text-end tabular-nums text-fg">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-meta text-fg-muted">Example report. Real reports show visits, redemptions and new members during your event, compared with the weekend before.</p>
    </figure>
  );
}

export default function BiaPage() {
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 pt-14 pb-16 md:px-8 md:pt-24 md:pb-24">
        <p className="text-meta-strong text-fg-muted">For BIAs and neighbourhood associations</p>
        <h1 className="display mt-5 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">proof that your street events bring people in.</h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-[1.55] text-fg-muted">Run a neighbourhood points weekend or passport through one app your shops already use. We handle the shops, you get the report.</p>
        <Button size="lg" href="#talk" className="mt-9">
          Talk to us
        </Button>
      </section>
      <MSection tone="subtle">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <MHeading eyebrow="Passport week" title="visit 5 shops, enter the draw." sub="Customers collect a visit at each participating shop. Every visit is a real purchase, recorded at the counter. Completers are entered in a prize draw." className="mb-8!" />
            <StampMock stamps={3} goal={5} reward="Draw entry" className="max-w-sm" />
          </div>
          <MockReport />
        </div>
      </MSection>
      <MSection>
        <div className="grid gap-px overflow-hidden rounded-sheet border border-line bg-line md:grid-cols-3">
          {[
            { t: "Points weekends and passports", b: "Double points across the street, or a visit-5-shops passport with a prize." },
            { t: "We do the setup with your shops", b: "Our reps sign up shops, print stands and train staff. Shops join free." },
            { t: "A report for your board", b: "Visits per shop per day, redemptions and new members, vs the weekend before." },
          ].map((b) => (
            <div key={b.t} className="bg-bg p-6 md:p-8">
              <h3 className="text-headline text-fg">{b.t}</h3>
              <p className="mt-2 text-body text-fg-muted">{b.b}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-6 border-t border-line pt-10 md:grid-cols-[1fr_1.4fr] md:items-end">
          <div>
            <p className="text-meta-strong text-fg-muted">Typical campaign</p>
            <p className="display mt-3 text-mkt-md tabular-nums md:text-mkt-lg">$1,500–3,000</p>
          </div>
          <p className="text-body text-fg-muted">Per campaign. Includes setup with your shops, customer texts and email to opted-in members, network-funded bonus points and the final report.</p>
        </div>
      </MSection>
      <MSection tone="subtle" id="talk">
        <div className="grid gap-12 md:grid-cols-2">
          <MHeading eyebrow="Talk to us" title="plan a campaign for your street." sub="Tell us about your BIA and your next event. We'll get back to you within 1 business day." />
          <div className="rounded-sheet border border-line bg-bg p-6 md:p-8">
            <ContactForm kind="bia" />
          </div>
        </div>
      </MSection>
    </>
  );
}
