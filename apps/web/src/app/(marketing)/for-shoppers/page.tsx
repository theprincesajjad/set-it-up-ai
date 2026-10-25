import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BRAND, formatDate, normalizeLocale, translator, type Locale, type MessageKey } from "@ll/shared";
import { Faq } from "@/components/marketing/Faq";
import { ShopperCardPhone } from "@/components/marketing/ShopperCard";
import { MHeading, MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { publicServerApi } from "@/lib/api/server";
import { env } from "@/lib/env";
import { LocaleScope } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/server";

// The language comes from ?lang= or the saved cookie, so the page renders per request; the data it shows is cached for 300 s by the API client.
export const revalidate = 300;

const BASE = { title: "For shoppers", description: "One card for every shop on your street. Earn rewards at the local places you already love. Free, and your points never expire.", alternates: { canonical: "/for-shoppers" } };

/** ?lang= wins, then the language cookie. English otherwise (no Accept-Language guessing: the header and the page must agree). */
async function pageLocale(sp: Record<string, string | string[] | undefined>): Promise<Locale> {
  const q = sp.lang;
  return normalizeLocale(Array.isArray(q) ? q[0] : q) ?? normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value) ?? "en";
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = translator(await pageLocale(await searchParams));
  return { ...BASE, title: t("sh.fs.meta.title"), description: t("sh.fs.meta.desc") };
}

const STEPS: [MessageKey, MessageKey][] = [
  ["sh.fs.s1t", "sh.fs.s1b"],
  ["sh.fs.s2t", "sh.fs.s2b"],
  ["sh.fs.s3t", "sh.fs.s3b"],
];
const DATA: [MessageKey, MessageKey][] = [
  ["sh.fs.d1t", "sh.fs.d1b"],
  ["sh.fs.d2t", "sh.fs.d2b"],
  ["sh.fs.d3t", "sh.fs.d3b"],
];
const FAQ: [MessageKey, MessageKey][] = [
  ["sh.fs.q1", "sh.fs.a1"],
  ["sh.fs.q2", "sh.fs.a2"],
  ["sh.fs.q3", "sh.fs.a3"],
  ["sh.fs.q4", "sh.fs.a4"],
  ["sh.fs.q5", "sh.fs.a5"],
  ["sh.fs.q6", "sh.fs.a6"],
];

/**
 * /for-shoppers: the page a flyer, a friend or a BIA link sends people to. Four jobs, in order: is it free and do I need an app
 * (hero, FAQ), what will I hold (one card, not two decorative phones), does it work where I shop (live street counts and the passport
 * that is on now), and can I read it in my language (switcher in the header; hi, ur, pa translated, Urdu right to left).
 */
export default async function ShoppersPage({ searchParams }: Props) {
  const locale = await pageLocale(await searchParams);
  const t = translator(locale);
  const pub = publicServerApi();
  const [hoods, live] = await Promise.all([
    pub.network.neighbourhoods().then((r) => r.items).catch(() => [] as { slug: string; name: string; shopCount: number }[]),
    pub.public.liveCampaigns().then((r) => r.items).catch(() => []),
  ]);
  const campaign = live[0] ?? null;
  const endsOn = campaign ? formatDate(locale, campaign.endsAt, { month: "short", day: "numeric" }) : "";
  return (
    <LocaleScope locale={locale}>
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 pt-14 pb-16 md:grid-cols-[1.05fr_1fr] md:px-8 md:pt-24 md:pb-28">
          <div>
            <p className="text-meta-strong text-fg-muted">{t("sh.fs.meta.title")}</p>
            <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">{t("sh.fs.h1")}</h1>
            <p className="mt-6 max-w-[32rem] text-[18px] leading-[1.55] text-fg-muted">{t("sh.fs.lead")}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/map">
                {t("sh.fs.ctaFind")}
              </Button>
              <Button size="lg" variant="secondary" href="/me">
                {t("sh.fs.ctaCard")}
              </Button>
            </div>
            <p className="mt-5 text-meta text-fg-muted">
              {t("sh.fs.scanOr")}{" "}
              <a href={env.appStoreUrl} className="font-semibold text-fg underline decoration-line-strong/60 underline-offset-2">
                App Store
              </a>{" "}
              ·{" "}
              <a href={env.playStoreUrl} className="font-semibold text-fg underline decoration-line-strong/60 underline-offset-2">
                Google Play
              </a>
            </p>
          </div>
          <div className="flex justify-center">
            <ShopperCardPhone title={t("sh.card.title")} headline={t("sh.wallet.rewardsReadyN", { n: 2 })} caption={t("sh.card.show")} walletLabel="Add to Apple Wallet" />
          </div>
        </div>
      </section>

      <MSection tone="subtle">
        <MHeading eyebrow={t("sh.fs.how")} title={t("sh.fs.stepsTitle")} />
        <ol className="grid gap-px overflow-hidden rounded-sheet border border-line bg-line md:grid-cols-3">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="bg-bg p-6 md:p-8">
              <span className="display text-mkt-sm tabular-nums text-fg-muted">{i + 1}</span>
              <h3 className="mt-6 text-headline text-fg">{t(title)}</h3>
              <p className="mt-2 text-body text-fg-muted">{t(body)}</p>
            </li>
          ))}
        </ol>
      </MSection>

      {hoods.length || campaign ? (
        <MSection>
          <MHeading eyebrow={t("sh.fs.liveNow")} title={t("sh.fs.whereTitle")} className="mb-8!" />
          {hoods.length ? (
            <ul className="flex flex-wrap gap-2">
              {hoods.map((h) => (
                <li key={h.slug}>
                  <Link href={`/neighbourhoods/${h.slug}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-meta-strong text-fg transition-colors hover:bg-bg-subtle focus-visible:focus-ring">
                    <span className="display lowercase">{h.name}</span>
                    <span className="font-normal tabular-nums text-fg-muted">{t("sh.fs.shopsN", { n: h.shopCount })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Only while a street campaign is live: the reason to carry one card down the whole street. */}
          {campaign ? (
            <Link href={`/c/${campaign.id}`} className="mt-6 flex flex-col gap-1 rounded-card bg-accent-soft p-5 transition-opacity hover:opacity-90 focus-visible:focus-ring">
              <span className="text-body-strong text-accent-text">{t("sh.fs.passportOn", { name: campaign.name })}</span>
              <span className="text-body text-fg">
                {campaign.kind === "passport"
                  ? t("sh.fs.passportLine", { goal: campaign.goalVisits, date: endsOn })
                  : campaign.bonusPoints > 0
                    ? `${t("sh.camp.stepBonus", { n: campaign.bonusPoints })} ${t("sh.disc.endsOn", { date: endsOn })}`
                    : campaign.multiplierPct
                      ? `${t("sh.camp.stepMult", { n: campaign.multiplierPct / 100 })} ${t("sh.disc.endsOn", { date: endsOn })}`
                      : t("sh.disc.endsOn", { date: endsOn })}
              </span>
            </Link>
          ) : null}
        </MSection>
      ) : null}

      <MSection tone="subtle">
        <MHeading eyebrow={t("sh.fs.dataEyebrow")} title={t("sh.fs.dataTitle")} />
        <div className="grid gap-px overflow-hidden rounded-sheet border border-line bg-line md:grid-cols-3">
          {DATA.map(([title, body]) => (
            <div key={title} className="bg-bg p-6 md:p-8">
              <h3 className="text-headline text-fg">{t(title)}</h3>
              <p className="mt-2 text-body text-fg-muted">{t(body)}</p>
            </div>
          ))}
        </div>
      </MSection>

      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <h2 className="display text-mkt-md md:text-mkt-lg">{t("sh.fs.faqTitle")}</h2>
          <Faq items={FAQ.map(([q, a]) => ({ q: t(q), a: t(a, { brand: BRAND.name }) }))} />
        </div>
      </MSection>
    </LocaleScope>
  );
}
