import { CalendarDays, ChartColumn, Store, Users } from "lucide-react";
import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/ContactForm";
import { MHeading, MSection } from "@/components/marketing/Section";
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

/** Mock report chart (visits per shop per day). Decorative; the table carries the data. */
function MockReport() {
  const max = 55;
  return (
    <figure className="rounded-xl bg-surface p-6 shadow-sm">
      <figcaption className="text-title text-fg">Visits per shop, Passport weekend</figcaption>
      <svg viewBox="0 0 320 160" className="mt-4 w-full" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2="320" y1={20 + i * 40} y2={20 + i * 40} className="stroke-chart-grid" strokeWidth="1" />
        ))}
        {SHOPS.map((s, si) =>
          s.v.map((v, di) => {
            const h = (v / max) * 140;
            const x = di * 105 + si * 22 + 10;
            return <rect key={`${si}-${di}`} x={x} y={160 - h} width="18" height={h} rx="4" className={["fill-chart-1", "fill-chart-2", "fill-chart-3", "fill-chart-4"][si]} />;
          }),
        )}
      </svg>
      <table className="mt-4 w-full text-body-sm">
        <caption className="sr-only">Visits per shop per day</caption>
        <thead>
          <tr className="text-fg-muted">
            <th scope="col" className="text-start font-semibold">
              Shop
            </th>
            {DAYS.map((d) => (
              <th key={d} scope="col" className="text-end font-semibold">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHOPS.map((s, si) => (
            <tr key={s.name} className="border-t border-border">
              <th scope="row" className="py-1 text-start font-normal">
                <span aria-hidden className={`me-2 inline-block size-2.5 rounded-full ${["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"][si]}`} />
                {s.name}
              </th>
              {s.v.map((v, i) => (
                <td key={i} className="text-end tabular-nums">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-caption text-fg-muted">Example report. Real reports show visits, redemptions and new members during your event, compared with the weekend before.</p>
    </figure>
  );
}

export default function BiaPage() {
  return (
    <>
      <MSection>
        <div className="max-w-3xl">
          <p className="text-overline uppercase text-fg-brand">For BIAs and neighbourhood associations</p>
          <h1 className="mt-3 font-display text-[40px] font-semibold leading-[44px] text-fg md:text-hero">Proof that your street events bring people in.</h1>
          <p className="mt-5 text-body-lg text-fg-muted">Run a neighbourhood points weekend or passport through one app your shops already use.</p>
          <Button size="lg" href="#talk" className="mt-8">
            Talk to us
          </Button>
        </div>
      </MSection>
      <MSection tone="subtle">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <MHeading eyebrow="Passport week" title="Visit 5 shops, enter the draw" sub="Customers collect a visit at each participating shop. Every visit is a real purchase, recorded at the counter. Completers are entered in a prize draw." />
            <div className="grid grid-cols-5 gap-2" aria-label="Example passport: 3 of 5 shops visited" role="img">
              {[1, 1, 1, 0, 0].map((v, i) => (
                <div key={i} className={`flex aspect-square items-center justify-center rounded-full ${v ? "bg-accent text-on-accent" : "border-2 border-dashed border-stamp-empty text-fg-muted"}`}>
                  <Store aria-hidden className="size-5" />
                </div>
              ))}
            </div>
          </div>
          <MockReport />
        </div>
      </MSection>
      <MSection>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: CalendarDays, t: "Points weekends and passports", b: "Double points across the street, or a visit-5-shops passport with a prize." },
            { icon: Users, t: "We do the setup with your shops", b: "Our reps sign up shops, print stands and train staff. Shops join free." },
            { icon: ChartColumn, t: "A report for your board", b: "Visits per shop per day, redemptions and new members, vs the weekend before." },
          ].map((b) => (
            <div key={b.t} className="rounded-xl bg-surface p-6 shadow-sm">
              <b.icon aria-hidden className="size-6 text-fg-brand" />
              <h3 className="mt-3 text-title text-fg">{b.t}</h3>
              <p className="mt-1 text-body text-fg-muted">{b.b}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-xl bg-brand-subtle p-6 text-on-brand-subtle md:p-8">
          <p className="text-overline uppercase">Typical campaign</p>
          <p className="mt-1 text-h2 tabular-nums">$1,500–3,000 per campaign</p>
          <p className="mt-2 text-body">Includes setup with your shops, customer texts and email to opted-in members, network-funded bonus points and the final report.</p>
        </div>
      </MSection>
      <MSection tone="subtle" id="talk">
        <div className="grid gap-10 md:grid-cols-2">
          <MHeading eyebrow="Talk to us" title="Plan a campaign for your street" sub="Tell us about your BIA and your next event. We'll get back to you within 1 business day." />
          <div className="rounded-xl bg-surface p-6 shadow-sm">
            <ContactForm kind="bia" />
          </div>
        </div>
      </MSection>
    </>
  );
}
