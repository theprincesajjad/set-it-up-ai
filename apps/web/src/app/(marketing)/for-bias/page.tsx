import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { campaignsApi } from "@ll/shared";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { SampleReportCard } from "@/components/marketing/SampleReportCard";
import { MHeading, MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { fill, moneyShort } from "@/lib/marketing/text";
import { BRAND } from "@ll/shared";

export const revalidate = 300;

export const metadata: Metadata = {
  title: copy.bia.title,
  description: copy.bia.description,
  alternates: { canonical: "/for-bias" },
};

const B = copy.bia;
const PACKAGES = campaignsApi.CAMPAIGN_PACKAGES;
const TIERS = [
  { kind: "points_weekend", tier: "Bronze" },
  { kind: "passport", tier: "Silver" },
  { kind: "multiplier", tier: "Gold" },
] as const;

/** "Bronze: points weekend" -> ["Bronze", "Points weekend"]. */
function packageName(kind: keyof typeof PACKAGES): [string, string] {
  const [tier, rest = ""] = PACKAGES[kind].name.split(": ");
  return [tier!, rest.charAt(0).toUpperCase() + rest.slice(1)];
}

const cheapest = Math.min(...Object.values(PACKAGES).map((p) => p.priceCents));
const passportGoal = PACKAGES.passport.goalVisits;

/**
 * For BIAs: the buyer's job is the board meeting, so the sample board report leads. Then the measurement gap, how a
 * campaign runs, packages (prices from CAMPAIGN_PACKAGES, never typed here), how BIAs pay, trust, FAQ and the form.
 */
export default function BiaPage() {
  return (
    <>
      {/* 1. Hero with the labelled sample board report. */}
      <section className="mx-auto max-w-[1200px] px-4 pt-14 pb-14 md:px-8 md:pt-24 md:pb-20">
        <div className="grid items-center gap-12 md:grid-cols-[1fr_1fr] md:gap-14">
          <div>
            <p className="text-meta-strong text-fg-muted">{B.eyebrow}</p>
            <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">{B.heroTitle}</h1>
            <p className="mt-6 max-w-xl text-[18px] leading-[1.55] text-fg-muted">{B.heroSub}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/for-bias/sample-report">
                {B.ctaSample}
              </Button>
              <Button size="lg" variant="secondary" href="#talk" className="rounded-full!">
                {B.ctaPlan}
              </Button>
            </div>
            <p className="mt-5 text-meta text-fg-muted">From {moneyShort(cheapest)} · we sign up and train your shops · aggregates only, no customer lists</p>
          </div>
          <SampleReportCard />
        </div>
      </section>

      {/* 2. The measurement gap: why a board report with a 30-day return exists. */}
      <MSection tone="subtle" id="why">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-16">
          <div>
            <MHeading eyebrow={B.gap.eyebrow} title={B.gap.title} sub={B.gap.body} className="mb-4!" />
            <p className="text-caption text-fg-muted">
              <a href={B.gap.sourceUrl} className="inline-flex items-center gap-1 underline decoration-line-strong/60 underline-offset-2 hover:decoration-fg">
                {B.gap.source}
                <ExternalLink aria-hidden className="size-3" strokeWidth={1.75} />
              </a>
            </p>
          </div>
          <div>
            <p className="mb-3 text-meta-strong text-fg-muted">{B.gap.cardTitle}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-sheet border border-line bg-bg">
              {B.gap.rows.map((r) => (
                <li key={r.t} className="px-5 py-4 md:px-6">
                  <p className="text-body-strong text-fg">{r.t}</p>
                  <p className="mt-0.5 text-meta text-fg-muted">{r.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MSection>

      {/* 3. How a campaign runs: who does what and when. */}
      <MSection id="how">
        <MHeading eyebrow={B.run.eyebrow} title={B.run.title} />
        <ol className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
          {B.run.steps.map((s, i) => (
            <li key={s.t} className="rounded-sheet border border-line bg-bg p-5 md:p-6">
              <h3 className="text-headline text-fg">
                <span className="me-2 tabular-nums text-fg-muted">{i + 1}</span>
                {s.t}
              </h3>
              <p className="mt-1 text-caption font-semibold text-accent-text">{s.who}</p>
              <p className="mt-3 text-body text-fg-muted">{s.b}</p>
            </li>
          ))}
        </ol>
      </MSection>

      {/* 4. Packages and how BIAs pay. */}
      <MSection tone="subtle" id="packages">
        <MHeading eyebrow={B.packages.eyebrow} title={B.packages.title} />
        <ul className="grid items-stretch gap-4 md:grid-cols-3">
          {TIERS.map(({ kind }) => {
            const [tier, name] = packageName(kind);
            const p = PACKAGES[kind];
            return (
              <li key={kind} className={cn("flex flex-col rounded-sheet bg-bg p-6 md:p-8", kind === "passport" ? "border-[1.5px] border-fg" : "border border-line")}>
                <h3 className="text-body-strong text-fg">
                  {tier} · {name}
                </h3>
                <p className="display mt-3 text-mkt-md tabular-nums md:text-mkt-lg">{moneyShort(p.priceCents)}</p>
                <p className="mt-1 text-meta text-fg-muted">
                  {p.days} days · visit {p.goalVisits} shops
                </p>
                <p className="mt-4 text-body text-fg">{fill(B.packages.blurbs[kind], { goal: p.goalVisits })}</p>
                <p className="mt-auto pt-4 text-caption text-fg-muted">{B.packages.includes}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 rounded-sheet border border-line bg-bg p-6 md:p-8">
          <h3 className="text-headline text-fg">{B.pay.title}</h3>
          <p className="mt-2 max-w-4xl text-body text-fg-muted">{B.pay.body}</p>
          <Button size="sm" variant="secondary" href="/for-bias/one-pager" className="mt-5">
            {B.pay.cta}
          </Button>
        </div>
      </MSection>

      {/* 5. Trust: shops, shoppers, data. */}
      <MSection>
        <ul className="grid items-stretch gap-4 md:grid-cols-3">
          {B.trust.map((t) => (
            <li key={t.t} className="rounded-sheet border border-line bg-bg p-6">
              <h3 className="display text-title">{t.t}</h3>
              <p className="mt-2 text-body text-fg-muted">{t.b}</p>
            </li>
          ))}
        </ul>
      </MSection>

      {/* 6. FAQ */}
      <MSection tone="subtle">
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <MHeading eyebrow={B.faqEyebrow} title={B.faqTitle} className="mb-0!" />
          <Faq items={B.faq.map((f) => ({ q: f.q, a: fill(f.a, { goal: passportGoal }) }))} />
        </div>
      </MSection>

      {/* 7. Talk to us, with the board meeting date (it sets the report deadline). */}
      <MSection id="talk" className="scroll-mt-16">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <MHeading eyebrow={B.talk.eyebrow} title={B.talk.title} sub={B.talk.sub} className="mb-8!" />
            <Button variant="secondary" size="lg" href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent("20-minute call about a street campaign")}`} className="rounded-full!">
              {B.talk.call}
            </Button>
          </div>
          <div className="rounded-sheet bg-bg-subtle p-6 md:p-8">
            <ContactForm kind="bia" />
          </div>
        </div>
      </MSection>
    </>
  );
}
