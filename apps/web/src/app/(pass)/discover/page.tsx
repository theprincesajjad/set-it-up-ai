import { verticalCategory, type VerticalCategory } from "@ll/design-tokens";
import { BRAND, formatDate, placeKindLabel, translator, type Locale, type MessageKey } from "@ll/shared";
import type { campaignsApi, customerApi, networkApi } from "@ll/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LanguageChip } from "@/components/pass/PassChrome";
import { PassTabBar } from "@/components/pass/PassTabBar";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { getServerApi, publicServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { LocaleScope } from "@/lib/i18n";
import { getLocaleForProfile, getT } from "@/lib/i18n/server";
import { URDU_LEADING } from "@/components/restaurant/PageFrame";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("sh.disc.title"), description: t("wp.t.discoverDesc"), robots: { index: false } };
}

const ROWS: { id: VerticalCategory }[] = [{ id: "coffee" }, { id: "bakery" }, { id: "eat" }, { id: "shops" }, { id: "beauty" }, { id: "services" }, { id: "repair" }];
/** The short chip caption; the row title above each shelf is the longer `sh.disc.row.*` ("places to eat"). */
const CHIP_KEY: Record<VerticalCategory, MessageKey> = {
  coffee: "sh.disc.row.coffee",
  bakery: "sh.disc.row.bakery",
  eat: "ms.cat.eat",
  shops: "sh.disc.row.shops",
  beauty: "sh.disc.row.beauty",
  services: "sh.disc.row.services",
  repair: "sh.disc.row.repair",
};
const CHIP_ORDER: VerticalCategory[] = ["coffee", "bakery", "services", "repair", "eat", "shops", "beauty"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function short(name: string | null | undefined) {
  return (name ?? "").replace(/\s+(Village|BIA|Neighbourhood)$/i, "").trim().toLowerCase();
}

const ROW_KEY: Record<VerticalCategory, MessageKey> = {
  coffee: "sh.disc.row.coffee",
  bakery: "sh.disc.row.bakery",
  eat: "sh.disc.row.eat",
  shops: "sh.disc.row.shops",
  beauty: "sh.disc.row.beauty",
  services: "sh.disc.row.services",
  repair: "sh.disc.row.repair",
};

/** The live campaign as the hero: eyebrow (name · when it ends), the one-line ask, and progress while it is a passport. */
function hero(c: campaignsApi.MyCampaign | campaignsApi.PublicCampaign, locale: Locale, t: ReturnType<typeof translator>) {
  const end = new Date(c.endsAt);
  const prize = c.prize ? c.prize.replace(/^win\s+/i, "").replace(/\.$/, "") : null;
  const ends = locale === "en" ? `${MONTHS[end.getMonth()]} ${end.getDate()}` : formatDate(locale, end, { month: "short", day: "numeric" });
  // l10n-ok: English branch
  const english = `visit ${c.goalVisits} shops, ${prize ? `win ${prize}` : c.bonusPoints ? `get ${c.bonusPoints} bonus points` : "finish the passport"}`;
  const ask = locale === "en" ? english : prize ? t("sh.disc.heroPassport", { goal: c.goalVisits, prize }) : t("sh.camp.stepVisit", { goal: c.goalVisits });
  const headline = c.kind === "passport" ? ask : c.name;
  const progress = "progress" in c ? { value: Math.min(c.progress.visited, c.progress.goal), max: c.progress.goal } : null;
  return { eyebrow: `${c.name.toLowerCase()} · ${t("sh.disc.endsOn", { date: ends })}`, headline: headline.toLowerCase(), progress: c.kind === "passport" ? progress : null };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Discover (canvas Discover.dc.html, Hypelist feed) on the web pass: hero for the live campaign, chips, near-you card, rows. */
export default async function DiscoverPage({ searchParams }: Props) {
  const sp = await searchParams;
  const only = typeof sp.c === "string" ? (sp.c as VerticalCategory) : null;
  const me = await getMe();
  const pub = publicServerApi();
  const api = me ? await getServerApi() : null;
  const [hoods, profile, wallet, mine] = await Promise.all([
    pub.network.neighbourhoods().then((r) => r.items).catch(() => [] as networkApi.NeighbourhoodDto[]),
    api ? api.me.profile().catch(() => null) : Promise.resolve(null as customerApi.ProfileDto | null),
    api ? api.me.memberships().catch(() => null) : Promise.resolve(null as customerApi.WalletResponse | null),
    api ? api.me.campaigns().then((r) => r.items).catch(() => [] as campaignsApi.MyCampaign[]) : Promise.resolve([] as campaignsApi.MyCampaign[]),
  ]);
  const hood = hoods.find((h) => h.id === profile?.homeNeighbourhood?.id) ?? hoods[0] ?? null;
  const locale = await getLocaleForProfile(sp, profile?.locale);
  const t = translator(locale);
  const shops = hood ? await (api ?? pub).network.shops({ neighbourhood: hood.slug, limit: 100 }).then((r) => r.items).catch(() => []) : [];
  const live = mine.find((c) => c.status === "live") ?? null;
  const ready = new Set((wallet?.items ?? []).filter((m) => m.rewardsAvailableCount > 0).map((m) => m.merchant.id));
  const name = short(hood?.name);
  const h = live ? hero(live, locale, t) : null;
  const rows = ROWS.filter((r) => !only || r.id === only)
    .map((r) => ({ ...r, shops: shops.filter((s) => verticalCategory(s.merchant.vertical) === r.id).sort((a, b) => Number(ready.has(b.merchant.id)) * 2 + Number(b.isMember) - (Number(ready.has(a.merchant.id)) * 2 + Number(a.isMember))) }))
    .filter((r) => r.shops.length > 0);
  const chips = CHIP_ORDER.map((id) => ROWS.find((r) => r.id === id)!).filter((r) => shops.some((s) => verticalCategory(s.merchant.vertical) === r.id));
  const nearPins = shops.slice(0, 2);

  return (
    <LocaleScope locale={locale} className={locale === "ur" ? URDU_LEADING.trimStart() : undefined}>
    <div className="-mx-4 -mt-4 pb-32">
      <section aria-label={h ? h.eyebrow : t("sh.disc.title")} className="relative h-[340px] overflow-hidden bg-ll-stone-950">
        <svg aria-hidden width="100%" height="340" viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" className="absolute inset-0">
          <g className="stroke-ll-stone-850" strokeWidth="10" fill="none" strokeLinecap="round"><path d="M150 -20 L 230 360" /><path d="M-20 90 L 410 60" /><path d="M-20 190 L 410 166" /><path d="M-20 290 L 410 266" /></g>
        </svg>
        {/* The three objects are from the canvas. In hi, ur and pa the headline runs wider and crosses them, so they step back. */}
        <div aria-hidden className={locale === "en" ? "" : "opacity-35"}>
          <CategoryIcon category="coffee" size={88} className="absolute left-[calc(100%-184px)] top-[58px] -rotate-[8deg]" />
          <CategoryIcon category="bakery" size={76} className="absolute left-[calc(100%-104px)] top-[132px] rotate-[10deg]" />
          <CategoryIcon category="beauty" size={58} className="absolute left-[calc(100%-162px)] top-[176px] -rotate-[14deg]" />
        </div>
        <div className="absolute inset-x-5 top-[58px] flex justify-between">
          <span className="display text-[15px] leading-[18px] text-white">{BRAND.name.toLowerCase()}</span>
          <div className="flex items-center gap-2">
            <LanguageChip className="border-transparent bg-white/[.12] text-white hover:bg-white/20 data-popup-open:bg-white/20" />
            <Link href="/me#activity" aria-label={t("sh.activity.title")} className="flex size-9 items-center justify-center rounded-full bg-white/[.12] text-white">
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </Link>
          </div>
        </div>
        <div className="absolute bottom-14 left-5 max-w-[240px]">
          <p className="text-[12px] font-semibold leading-4 text-ll-orange-400">{h ? h.eyebrow : name ? t("sh.disc.streetLine", { street: name, n: shops.length }) : t("sh.disc.near")}</p>
          <h1 className="display mt-2 text-[32px] leading-[34px] text-white">{h ? h.headline : t("sh.disc.heroDefault")}</h1>
        </div>
        {h?.progress ? (
          <div className="absolute inset-x-5 bottom-6 flex items-center gap-2.5">
            <div className="h-1 flex-1 rounded-full bg-white/[.18]"><div className="h-1 rounded-full bg-points" style={{ width: `${(h.progress.value / h.progress.max) * 100}%` }} /></div>
            <span className="text-[12px] font-semibold tabular-nums text-white">{h.progress.value} / {h.progress.max}</span>
          </div>
        ) : null}
      </section>

      <nav aria-label={t("wp.cat.label")} className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4">
        <Link href="/discover" aria-current={!only ? "page" : undefined} className={cn("display inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold tracking-normal", !only ? "bg-trade text-trade-foreground" : "bg-bg-subtle text-fg")}>
          {t("sh.disc.forYou")}
          <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
        </Link>
        {chips.map((c) => (
          <Link key={c.id} href={`/discover?c=${c.id}`} aria-current={only === c.id ? "page" : undefined} className={cn("display inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[14px] font-bold tracking-normal", only === c.id ? "bg-trade text-trade-foreground" : "bg-bg-subtle text-fg")}>
            {t(CHIP_KEY[c.id])}
          </Link>
        ))}
      </nav>

      <section className="mt-6 px-4" aria-labelledby="near">
        <div className="flex items-baseline justify-between">
          <h2 id="near" className="display text-[20px] leading-6 text-fg">{t("sh.disc.near")}</h2>
          <span className="text-[13px] text-fg-muted">{t("sh.disc.shopsN", { n: shops.length })}</span>
        </div>
        <Link href="/map" className="relative mt-3 block h-[120px] overflow-hidden rounded-[16px] bg-ll-stone-50 dark:bg-bg-subtle">
          <svg aria-hidden width="100%" height="120" viewBox="0 0 358 120" preserveAspectRatio="none" className="absolute inset-0">
            <g strokeWidth="9" fill="none" strokeLinecap="round" className="stroke-ll-stone-0 dark:stroke-ll-stone-800"><path d="M120 -10 L 170 130" /><path d="M-10 40 L 370 26" /><path d="M-10 92 L 370 80" /></g>
          </svg>
          <span aria-hidden className="absolute left-[calc(42%-7px)] top-[59px] size-[15px] rounded-full border-2 border-white bg-location" />
          {nearPins.map((s, i) => (
            <span key={s.merchant.id} aria-hidden className={cn("absolute flex size-[30px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,.12)]", i === 0 ? "left-[27%] top-4" : "left-[51%] top-[54px]")}>
              <CategoryIcon vertical={s.merchant.vertical} size={20} />
            </span>
          ))}
          <span className="absolute bottom-3 left-3 inline-flex h-8 items-center rounded-full bg-bg px-3.5 text-[13px] font-semibold text-fg shadow-float">{t("sh.disc.openMap")}</span>
        </Link>
      </section>

      {rows.map((r, i) => (
        <section key={r.id} className={cn("ps-4", i === 0 ? "mt-2.5" : "mt-7")} aria-labelledby={`row-${r.id}`}>
          <h2 id={`row-${r.id}`} className="display text-[20px] leading-6 text-fg">{name ? t("sh.disc.rowOn", { kind: t(ROW_KEY[r.id]), street: name }) : t("sh.disc.rowNear", { kind: t(ROW_KEY[r.id]) })}</h2>
          <ul className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pe-4">
            {r.shops.slice(0, 12).map((s) => (
              <li key={s.merchant.id} className="w-[168px] shrink-0">
                <Link href={`/shops/${s.merchant.slug}`} className="block">
                  <span className="relative flex h-[184px] items-center justify-center rounded-[16px] bg-bg-subtle">
                    <CategoryIcon vertical={s.merchant.vertical} size={76} />
                    {ready.has(s.merchant.id) ? <span className="absolute left-2.5 top-2.5 inline-flex h-6 items-center rounded-full bg-points-soft px-[9px] text-[12px] font-semibold text-points-text">{t("sh.wallet.rewardReady")}</span> : null}
                  </span>
                  <span className="display mt-2.5 line-clamp-2 text-[15px] leading-[1.15] font-bold tracking-normal text-fg">{s.merchant.name.toLowerCase()}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-fg-muted">{[placeKindLabel(locale, s.merchant.vertical), s.distanceMetres != null ? `${Math.round(s.distanceMetres / 10) * 10} m` : null, s.openNow ? t("sh.disc.open") : null].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <PassTabBar active={null} />
    </div>
    </LocaleScope>
  );
}
