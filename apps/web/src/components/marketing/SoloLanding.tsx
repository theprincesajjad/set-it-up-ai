import { translator, type Locale } from "@ll/shared";
import { Faq } from "@/components/marketing/Faq";
import { JobsRow } from "@/components/marketing/JobsRow";
import { CompetitorTableSolo } from "@/components/marketing/CompetitorTableSolo";
import { PlanStrip } from "@/components/marketing/PlanStrip";
import { PresetsBand } from "@/components/marketing/PresetsBand";
import { PrivacyBand } from "@/components/marketing/PrivacyBand";
import { RegularsBand } from "@/components/marketing/RegularsBand";
import { MHeading, MSection } from "@/components/marketing/Section";
import { SoloHero } from "@/components/marketing/SoloHero";
import { SoloSignup } from "@/components/marketing/SoloSignup";
import { copy } from "@/copy/en-CA";
import { LocaleScope } from "@/lib/i18n";
import { SAMPLE_SERVICES, SOLO_PAGES, soloVertical, type NailTrade, type SoloPageId } from "@/lib/marketing/solo";

/** Hero keys per page and trade. Written out so each key stays a literal MessageKey. */
const HERO = {
  nails: { eyebrow: "mkt.solo.nail.eyebrow", title: "mkt.solo.nail.title", sub: "mkt.solo.nail.sub" },
  brows: { eyebrow: "mkt.solo.brows.eyebrow", title: "mkt.solo.brows.title", sub: "mkt.solo.brows.sub" },
  lashes: { eyebrow: "mkt.solo.lashes.eyebrow", title: "mkt.solo.lashes.title", sub: "mkt.solo.lashes.sub" },
  makeup: { eyebrow: "mkt.solo.makeup.eyebrow", title: "mkt.solo.makeup.title", sub: "mkt.solo.makeup.sub" },
  barber: { eyebrow: "mkt.solo.barber.eyebrow", title: "mkt.solo.barber.title", sub: "mkt.solo.barber.sub" },
  groom: { eyebrow: "mkt.solo.groom.eyebrow", title: "mkt.solo.groom.title", sub: "mkt.solo.groom.sub" },
} as const;
const CTA = { nail: "mkt.solo.nail.cta", barber: "mkt.solo.barber.cta", groom: "mkt.solo.groom.cta" } as const;
const JOBS_TITLE = { nail: "mkt.solo.jobs.nailTitle", barber: "mkt.solo.jobs.barberTitle", groom: "mkt.solo.jobs.groomTitle" } as const;
const SCREEN = { nail: "booking", barber: "line", groom: "pet" } as const;
const ARTS = { nail: ["nails", "brows_lashes"], barber: ["barber", "stamp_card"], groom: ["groomer", "calendar_week"] } as const;
/** The nail page's hero objects follow ?trade= (a brow tech sees her own tools first). */
const NAIL_ARTS = { nails: ["nails", "deposit"], brows: ["brows_lashes", "deposit"], lashes: ["brows_lashes", "calendar_week"], makeup: ["makeup", "deposit"] } as const;

/**
 * One landing page from the eight blocks of solo-pro-launch.md 5.3: hero, three jobs, regulars, privacy (nail page only), plans,
 * comparison, the site, FAQ and the inline sign-up. `trade` only applies to the nail page (`?trade=brows|lashes|makeup`).
 */
export function SoloLanding({ id, locale, trade = "nails" }: { id: SoloPageId; locale: Locale; trade?: NailTrade }) {
  const t = translator(locale);
  const page = SOLO_PAGES[id];
  const C = copy.solo;
  const P = C[id];
  const key = id === "nail" ? trade : id;
  const h = HERO[key];
  const vertical = soloVertical(id, trade);
  const signup = `/signup?vertical=${vertical}&src=${page.src}`;
  const services = SAMPLE_SERVICES[key];
  return (
    <LocaleScope locale={locale}>
      <div data-solo-page={id} data-solo-trade={key}>
        {/* 1. Hero */}
        <SoloHero
          eyebrow={t(h.eyebrow)}
          title={t(h.title)}
          sub={t(h.sub)}
          cta={t(CTA[id])}
          ctaHref="#start"
          secondaryLabel={t("mkt.solo.ctaPlans")}
          trust={t("mkt.solo.trust")}
          caption={t("mkt.solo.sample")}
          trade={vertical}
          screen={SCREEN[id]}
          sampleName={page.sampleName}
          services={services}
          arts={[...(id === "nail" ? NAIL_ARTS[trade] : ARTS[id])]}
        />
        {/* 2. Three jobs */}
        <JobsRow eyebrow={t("mkt.solo.jobs.eyebrow")} title={t(JOBS_TITLE[id])} jobs={P.jobs} />
        {/* 3. Regulars, with the client-loop line */}
        <RegularsBand eyebrow={t("mkt.solo.regulars.eyebrow")} title={t("mkt.solo.regulars.title")} sub={t("mkt.solo.regulars.sub")} points={P.regulars} loop={t("mkt.solo.regulars.loop")} locale={locale} vertical={vertical} />
        {/* 4. Privacy (home studios: the nail page only) */}
        {id === "nail" ? <PrivacyBand eyebrow={t("mkt.solo.privacy.eyebrow")} title={t("mkt.solo.privacy.title")} sub={t("mkt.solo.privacy.sub")} points={C.nail.privacy} before={C.nail.privacyBefore} beforeLine={C.nail.privacyBeforeLine} after={C.nail.privacyAfter} afterLine={C.nail.privacyAfterLine} /> : null}
        {/* 5. Plans */}
        <PlanStrip c={{ eyebrow: t("mkt.solo.plans.eyebrow"), title: t("mkt.solo.plans.title"), note: t("mkt.solo.plans.note"), free: t("mkt.solo.plans.free"), monthly: t("mkt.solo.plans.monthly"), yearly: t("mkt.solo.plans.yearly"), see: t("mkt.solo.plans.see"), lists: C.plans }} />
        {/* 6. Comparison */}
        <CompetitorTableSolo c={{ eyebrow: t("mkt.solo.compare.eyebrow"), title: t("mkt.solo.compare.title"), sub: t("mkt.solo.compare.sub"), brand: "Local Loyalty", rows: C.compare.rows, us: C.compare.us, usSource: C.compare.usSource, foot: C.compare.foot }} chairs={id === "barber"} />
        {/* 7. The site */}
        <PresetsBand eyebrow={t("mkt.solo.presets.eyebrow")} title={t("mkt.solo.presets.title")} sub={t("mkt.solo.presets.sub")} sample={t("mkt.solo.sample")} siteName={page.sampleName} book="Book now" reviews="4.9 · 112 reviews" />
        {/* 8. FAQ, then the inline sign-up */}
        <MSection>
          <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
            <MHeading eyebrow={t("mkt.solo.faq.eyebrow")} title={t("mkt.solo.faq.title")} className="mb-0!" />
            <Faq items={P.faq.map((f) => ({ q: f.q, a: f.a }))} />
          </div>
        </MSection>
        <MSection tone="peach" id="start">
          <div className="grid gap-12 md:grid-cols-2">
            <MHeading eyebrow={t("mkt.solo.form.eyebrow")} title={t("mkt.solo.form.title")} sub={t("mkt.solo.form.sub")} className="mb-0!" />
            <div className="rounded-sheet bg-card p-6 shadow-card md:p-8">
              <SoloSignup vertical={vertical} src={page.src} />
              <a href={signup} className="mt-4 inline-flex min-h-11 items-center text-meta text-muted-foreground underline underline-offset-2">
                {C.fullPage}
              </a>
            </div>
          </div>
        </MSection>
      </div>
    </LocaleScope>
  );
}
