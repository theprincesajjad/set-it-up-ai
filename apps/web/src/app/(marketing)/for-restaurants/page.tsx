import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FEES, RESTAURANT_PLANS, RESTAURANT_TIERS, normalizeLocale, t as translate, type Locale } from "@ll/shared";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { FestivalList } from "@/components/marketing/FestivalList";
import { FoundingStrip } from "@/components/marketing/FoundingStrip";
import { JobCards } from "@/components/marketing/JobCards";
import { KitchenTicket, RestaurantPhone } from "@/components/marketing/RestaurantMocks";
import { MHeading, MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { LocaleScope } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/server";
import { DOORDASH_CANADA, formatAsOf } from "@/lib/marketing/sources";
import { appCommission, dollarRange } from "@/lib/marketing/savings";
import { fill, moneyShort } from "@/lib/marketing/text";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

// The language comes from ?lang= or the saved cookie, so the page renders per request; the data it shows is cached for 300 s by the API client.
export const revalidate = 300;

export const metadata: Metadata = {
  title: copy.restaurants.title,
  description: copy.restaurants.description,
  alternates: { canonical: "/for-restaurants" },
};

const R = copy.restaurants;

/** ?lang= wins, then the language cookie. English otherwise (no Accept-Language guessing: the header and the page must agree). */
async function pageLocale(sp: Record<string, string | string[] | undefined>): Promise<Locale> {
  const q = sp.lang;
  return normalizeLocale(Array.isArray(q) ? q[0] : q) ?? normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? "en";
}

const torontoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForRestaurantsPage({ searchParams }: Props) {
  const locale = await pageLocale(await searchParams);
  const t = (k: Parameters<typeof translate>[1]) => translate(locale, k);
  const c = appCommission(500_000);
  const prices = RESTAURANT_TIERS.map((tier) => ({ tier, name: RESTAURANT_PLANS[tier].name.replace(/^Restaurant /, ""), price: moneyShort(RESTAURANT_PLANS[tier].priceCents) }));
  return (
    <>
      {/* 1. Hero: the promise and the owner's own menu, in the visitor's language. */}
      <LocaleScope locale={locale}>
        <section className="overflow-hidden">
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-14 pb-14 md:grid-cols-[1.1fr_1fr] md:gap-14 md:px-8 md:pt-24 md:pb-20">
            <div>
              <p className="text-meta-strong text-fg-muted">{t("mkt.rest.eyebrow")}</p>
              <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">{t("mkt.rest.title")}</h1>
              <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-fg-muted">{t("mkt.rest.sub")}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" href="#plans">
                  {t("mkt.rest.ctaSave")}
                </Button>
                <Button size="lg" variant="secondary" href="#book" className="rounded-full!">
                  {t("mkt.rest.ctaBook")}
                </Button>
              </div>
              {locale === "en" ? <p className="mt-5 max-w-[34rem] text-meta text-fg-muted">0% commission on your own orders · menu set up for you · founding offer: 50% off the first year</p> : null}
            </div>
            <div className="flex justify-center md:justify-end">
              <RestaurantPhone />
            </div>
          </div>
        </section>
      </LocaleScope>

      {/* 2. Founding strip: real spots from the API; absent when the API fails. */}
      <FoundingStrip />

      {/* 3. Four jobs. */}
      <JobCards />

      {/* 4. Festival calendar: the next 120 days, from the in-app calendar. */}
      <MSection tone="subtle" id="festivals">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-16">
          <MHeading eyebrow={R.festivalsEyebrow} title={R.festivalsTitle} sub={R.festivalsSub} className="mb-0!" />
          <FestivalList today={torontoToday()} />
        </div>
      </MSection>

      {/* 5. Kitchen screens in Urdu, right to left. */}
      <MSection>
        <div className="grid items-center gap-10 md:grid-cols-[1fr_1fr] md:gap-16">
          <MHeading eyebrow={R.kitchenEyebrow} title={R.kitchenTitle} sub={R.kitchenSub} className="mb-0!" />
          <KitchenTicket />
        </div>
      </MSection>

      {/* 6. Plans and the math, with its limit: we do not deliver. */}
      <MSection tone="ink" id="plans">
        <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:items-center md:gap-16">
          <div>
            <p className="text-meta-strong text-bg/60">{R.plansEyebrow}</p>
            <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{R.plansTitle}</h2>
            <p className="mt-5 text-[17px] leading-[1.55] text-bg/65">
              {prices.map((p) => `${p.name} ${p.price}`).join(" · ")} a month. Annual plans pay 10 months. On $5,000 of orders moved off the apps you keep {dollarRange(c.pickupLowCents, c.deliveryMaxCents)} a month before our fee. Delivery needs your own drivers.
            </p>
            <p className="mt-3 text-caption text-bg/70">
              Delivery-app rates from DoorDash Canada, read {formatAsOf(DOORDASH_CANADA.asOf)}:{" "}
              <a href={DOORDASH_CANADA.sourceUrl} className="underline underline-offset-2">
                merchants.doordash.com/en-ca
              </a>
              .
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {prices.map((p) => (
              <div key={p.tier} className="flex items-center justify-between rounded-card bg-bg px-5 py-4 text-fg">
                <span className="text-body-strong">{p.name}</span>
                <span className="display text-title tabular-nums">{p.price} /mo</span>
              </div>
            ))}
            <Button variant="inverse" size="lg" href="/pricing?for=restaurant#math" className="mt-2 self-start">
              {R.plansCta}
            </Button>
          </div>
        </div>
      </MSection>

      {/* 7. Week one: we do the typing. */}
      <MSection>
        <MHeading eyebrow={R.weekEyebrow} title={R.weekTitle} />
        <ol className="grid items-stretch gap-4 md:grid-cols-3">
          {R.week.map((w) => (
            <li key={w.t} className="rounded-sheet border border-line bg-bg p-6">
              <h3 className="display text-title">{w.t}</h3>
              <p className="mt-2 text-body text-fg-muted">{w.b}</p>
            </li>
          ))}
        </ol>
      </MSection>

      {/* 8. FAQ: the five objections we expect. */}
      <MSection tone="subtle">
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <MHeading eyebrow={R.faqEyebrow} title={R.faqTitle} className="mb-0!" />
          <Faq items={R.faq.map((f) => ({ q: f.q, a: fill(f.a, { billing: pct(FEES.tiffinBps) }) }))} />
        </div>
      </MSection>

      {/* 9. Book a visit: phone first, WhatsApp button, language field. No email-first form. */}
      <LocaleScope locale={locale}>
        <MSection id="book">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <MHeading eyebrow={t("mkt.rest.form.eyebrow")} title={t("mkt.rest.form.title")} sub={t("mkt.rest.form.sub")} className="mb-8!" />
              <Button variant="secondary" size="lg" href={whatsappUrl(R.bookWhatsappText)} className="rounded-full!">
                {t("mkt.rest.form.whatsapp")}
              </Button>
            </div>
            <div className="rounded-sheet bg-bg-subtle p-6 md:p-8">
              <ContactForm kind="restaurant" />
            </div>
          </div>
        </MSection>
      </LocaleScope>
    </>
  );
}
