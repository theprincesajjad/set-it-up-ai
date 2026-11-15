import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FEES, FOUNDING_OFFER, RESTAURANT_PLANS, RESTAURANT_TIERS, formatDate, normalizeLocale, t as translate, type Locale } from "@ll/shared";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { FestivalList } from "@/components/marketing/FestivalList";
import { FoundingStrip } from "@/components/marketing/FoundingStrip";
import { JobCards } from "@/components/marketing/JobCards";
import { KitchenTicket, RestaurantPhone } from "@/components/marketing/RestaurantMocks";
import { PhoneStage } from "@/components/marketing/HeroArt";
import { MHeading, MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { restaurantCopy } from "@/copy/restaurants-locales";
import { LocaleScope } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { languageAlternates } from "@/lib/marketing/language-alternates";
import { DOORDASH_CANADA, formatAsOf } from "@/lib/marketing/sources";
import { appCommission, dollars } from "@/lib/marketing/savings";
import { fill, moneyShort, sentenceCase } from "@/lib/marketing/text";
import { whatsappUrl } from "@/lib/marketing/whatsapp";
import { preloadInter } from "@/lib/fonts/inter";

// The language comes from ?lang= or the saved cookie, so the page renders per request; the data it shows is cached for 300 s by the API client.
export const revalidate = 300;

const R = copy.restaurants;

/** ?lang= wins, then the language cookie. English otherwise (no Accept-Language guessing: the header and the page must agree). */
async function pageLocale(sp: Record<string, string | string[] | undefined>): Promise<Locale> {
  const q = sp.lang;
  return normalizeLocale(Array.isArray(q) ? q[0] : q) ?? normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? "en";
}

const torontoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/**
 * Urdu runs right to left, and a "$" before digits that follow Arabic letters loses its place ("5,000$"). Each amount is set in its own
 * left-to-right isolate (LRI ... PDI), so it reads "$5,000" in every sentence, as the plan prices already did. Other languages are unchanged.
 */
const isolateMoney = (text: string) => text.replace(/\$\d[\d,]*(?:\.\d+)?/g, (m) => `\u2066${m}\u2069`);
function isolateAll<T>(v: T): T {
  if (typeof v === "string") return isolateMoney(v) as T;
  if (Array.isArray(v)) return v.map(isolateAll) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isolateAll(x)])) as T;
  return v;
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** The tab title and description in the page's language (from the translated nav label and hero), with hreflang links to all four. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = await pageLocale(await searchParams);
  const alternates = languageAlternates("/for-restaurants", locale);
  if (locale === "en") return { title: R.title, description: R.description, alternates };
  return { title: `${translate(locale, "mkt.nav.restaurants")}: ${translate(locale, "mkt.rest.title")}`, description: translate(locale, "mkt.rest.sub"), alternates };
}

export default async function ForRestaurantsPage({ searchParams }: Props) {
  preloadInter();
  const locale = await pageLocale(await searchParams);
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  const rtl = locale === "ur";
  const S = rtl ? isolateAll(restaurantCopy(locale)) : restaurantCopy(locale);
  const money = (text: string) => (rtl ? isolateMoney(text) : text);
  const waUrl = whatsappUrl(R.bookWhatsappText);
  const c = appCommission(500_000);
  const prices = RESTAURANT_TIERS.map((tier) => ({ tier, name: RESTAURANT_PLANS[tier].name.replace(/^Restaurant /, ""), price: money(moneyShort(RESTAURANT_PLANS[tier].priceCents)) }));
  return (
    <>
      {/* One LocaleScope for the whole page: each scope mirrors lang and dir onto <html> and puts back what it found when it unmounts, so
          sibling scopes put back each other's "rtl" and an English page reached by a client-side link stayed right to left. */}
      {/* 1. Hero: the promise and the owner's own menu, in the visitor's language. */}
      <LocaleScope locale={locale}>
        <section className="overflow-hidden">
          <div className="mx-auto grid max-w-360 grid-cols-[minmax(0,1fr)] items-center gap-12 px-5 pt-14 pb-14 md:px-10 xl:px-15 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-24 lg:pb-20">
            <div>
              <p className="mkt-rise inline-flex rounded-full bg-tile-butter px-4 py-2 text-meta-strong text-tile-butter-foreground">{t("mkt.rest.eyebrow")}</p>
              <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">{sentenceCase(t("mkt.rest.title"))}</h1>
              <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-muted-foreground">{t("mkt.rest.sub")}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" href="/signup?vertical=restaurant_south_asian">
                  {t("mkt.rest.ctaStart")}
                </Button>
                <Button size="lg" variant="secondary" href="#plans" className="rounded-full!">
                  {t("mkt.rest.ctaSave")}
                </Button>
              </div>
              {/* Wave P: two buttons, not three; the visit is a link under them, and the price is in the first line a person reads. */}
              <a href="#book" className="mt-4 inline-flex min-h-11 items-center text-body-strong text-foreground underline decoration-input/60 underline-offset-4 hover:decoration-foreground">
                {t("mkt.rest.ctaBook")}
              </a>
              <p className="mt-3 max-w-[34rem] text-meta text-muted-foreground">{fill(S.heroFacts, { price: money(moneyShort(RESTAURANT_PLANS.starter.priceCents)), first: FOUNDING_OFFER.firstYearPct })}</p>
            </div>
            <PhoneStage arts={["eat", "coffee"]}>
              <RestaurantPhone note={S.phoneNote} locale={locale} dishes={S.jobs[0].rows} />
            </PhoneStage>
          </div>
        </section>

      {/* Sections 2 to 8, in the visitor's language too (copy/restaurants-locales.ts): the page's promise is language. */}
      {/* 2. Founding strip: real spots from the API; absent when the API fails. */}
      <FoundingStrip c={S} />

      {/* 3. Four jobs. */}
      <JobCards c={S} />

      {/* 4. Festival calendar: the next 120 days, from the in-app calendar. */}
      <MSection tone="butter" id="festivals" reveal>
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-16">
          <MHeading eyebrow={S.festivalsEyebrow} title={S.festivalsTitle} sub={S.festivalsSub} className="mb-0!" />
          <FestivalList today={torontoToday()} c={S} locale={locale} />
        </div>
      </MSection>

      {/* 5. Kitchen screens in Urdu, right to left. */}
      <MSection reveal>
        <div className="grid items-center gap-10 md:grid-cols-[1fr_1fr] md:gap-16">
          <MHeading eyebrow={S.kitchenEyebrow} title={S.kitchenTitle} sub={S.kitchenSub} className="mb-0!" />
          <KitchenTicket note={S.kitchenNote} />
        </div>
      </MSection>

      {/* 6. Plans and the math, with its limit: we do not deliver. */}
      <MSection tone="ink" id="plans" reveal>
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:items-center md:gap-16">
          <div>
            <p className="text-meta-strong opacity-90">{S.plansEyebrow}</p>
            <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{sentenceCase(S.plansTitle)}</h2>
            <p className="mt-5 text-[17px] leading-[1.55]">
              {fill(S.plansBody, { prices: prices.map((p) => `${p.name} ${p.price}`).join(" · "), range: c.pickupLowCents === c.deliveryMaxCents ? money(dollars(c.pickupLowCents)) : fill(S.rangeTo, { min: money(dollars(c.pickupLowCents)), max: money(dollars(c.deliveryMaxCents)) }) })}
            </p>
            <p className="mt-3 text-caption">
              {fill(S.plansSource, { date: locale === "en" ? formatAsOf(DOORDASH_CANADA.asOf) : formatDate(locale, `${DOORDASH_CANADA.asOf}T12:00:00Z`, { month: "short", day: "numeric", year: "numeric" }, "UTC") })}{" "}
              <a href={DOORDASH_CANADA.sourceUrl} dir="ltr" className="underline underline-offset-2">
                merchants.doordash.com/en-ca
              </a>
              {locale === "en" ? "." : null}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {prices.map((p) => (
              <div key={p.tier} className="flex items-center justify-between rounded-card bg-background px-5 py-4 text-foreground">
                <span className="text-body-strong">{p.name}</span>
                <span className="display text-title tabular-nums">
                  {p.price} {S.perMonth}
                </span>
              </div>
            ))}
            <Button variant="inverse" size="lg" href="/pricing?for=restaurant#math" className="mt-2 self-start">
              {S.plansCta}
            </Button>
          </div>
        </div>
      </MSection>

      {/* 7. Week one: we do the typing. */}
      <MSection reveal>
        <MHeading eyebrow={S.weekEyebrow} title={S.weekTitle} />
        <ol className="grid items-stretch gap-4 md:grid-cols-3">
          {S.week.map((w, n) => (
            <li key={w.t} className="mkt-lift rounded-sheet bg-card p-6 shadow-card">
              <span className={`display mb-4 flex size-10 items-center justify-center rounded-[14px] text-title ${["bg-tile-peach text-tile-peach-foreground", "bg-tile-mint text-tile-mint-foreground", "bg-tile-butter text-tile-butter-foreground"][n % 3]}`}>{n + 1}</span>
              <h3 className="display text-title">{w.t}</h3>
              <p className="mt-2 text-body text-muted-foreground">{w.b}</p>
            </li>
          ))}
        </ol>
      </MSection>

      {/* 8. FAQ: the five objections we expect. */}
      <MSection reveal>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <MHeading eyebrow={S.faqEyebrow} title={S.faqTitle} className="mb-0!" />
          <Faq items={S.faq.map((f) => ({ q: f.q, a: fill(f.a, { billing: pct(FEES.tiffinBps) }) }))} />
        </div>
      </MSection>

      {/* 9. Book a visit: phone first, WhatsApp button, language field. No email-first form. */}
        <MSection id="book" tone="peach">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <MHeading eyebrow={t("mkt.rest.form.eyebrow")} title={t("mkt.rest.form.title")} sub={t("mkt.rest.form.sub")} className="mb-8!" />
              {waUrl ? (
                <Button variant="secondary" size="lg" href={waUrl} className="rounded-full!">
                  {t("mkt.rest.form.whatsapp")}
                </Button>
              ) : null}
            </div>
            <div className="rounded-sheet bg-card p-6 shadow-card md:p-8">
              <ContactForm kind="restaurant" />
            </div>
          </div>
        </MSection>
      </LocaleScope>
    </>
  );
}
