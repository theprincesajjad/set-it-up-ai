import { verticalCategory, type VerticalCategory } from "@ll/design-tokens";
import { BRAND, formatDate, placeKindLabel, translator, type Locale, type MessageKey } from "@ll/shared";
import type { campaignsApi, customerApi, networkApi } from "@ll/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LanguageChip } from "@/components/pass/PassChrome";
import { PassTabBar } from "@/components/pass/PassTabBar";
import { Bell, MapPin } from "lucide-react";
import { Awning } from "@/components/ui/Awning";
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
    <div className="pb-32">
      <Awning size="sm" className="rounded-b-md rounded-t-none" />
      <header className="mt-3 flex items-center gap-2">
        <span className="min-w-0 flex-1 font-wordmark text-[19px] font-extrabold leading-none text-foreground">{BRAND.name.toLowerCase()}</span>
        <LanguageChip />
        <Link href="/me#activity" aria-label={t("sh.activity.title")} className="flex size-11 items-center justify-center rounded-full text-foreground hover:bg-hover focus-visible:focus-ring">
          <Bell aria-hidden className="size-5" strokeWidth={1.75} />
        </Link>
      </header>
      <section aria-label={h ? h.eyebrow : t("sh.disc.title")} className="mt-4 flex flex-col gap-3">
        <p className="text-meta-strong text-primary-text">{h ? h.eyebrow : name ? t("sh.disc.streetLine", { street: name, n: shops.length }) : t("sh.disc.near")}</p>
        <h1 className="font-display text-[clamp(30px,9vw,38px)] font-bold leading-[1.1] tracking-[-0.03em] text-foreground">{h ? h.headline : t("sh.disc.heroDefault")}</h1>
        {h?.progress ? (
          <div className="flex items-center gap-3 rounded-card bg-tile-butter p-4 text-tile-butter-foreground">
            <div role="progressbar" aria-label={h.eyebrow} aria-valuemin={0} aria-valuemax={h.progress.max} aria-valuenow={h.progress.value} className="h-2 flex-1 overflow-hidden rounded-full bg-current/20"><div className="h-full rounded-full bg-current" style={{ width: `${(h.progress.value / h.progress.max) * 100}%` }} /></div>
            <span className="text-meta-strong tabular-nums">{h.progress.value} / {h.progress.max}</span>
          </div>
        ) : null}
      </section>

      <nav aria-label={t("wp.cat.label")} className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        <Link href="/discover" aria-current={!only ? "page" : undefined} className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-meta-strong", !only ? "bg-primary text-primary-foreground shadow-glow" : "border border-line bg-card text-fg")}>
          {t("sh.disc.forYou")}
                  </Link>
        {chips.map((c) => (
          <Link key={c.id} href={`/discover?c=${c.id}`} aria-current={only === c.id ? "page" : undefined} className={cn("inline-flex h-10 shrink-0 items-center rounded-full px-4 text-meta-strong", only === c.id ? "bg-primary text-primary-foreground shadow-glow" : "border border-line bg-card text-fg")}>
            {t(CHIP_KEY[c.id])}
          </Link>
        ))}
      </nav>

      <section className="mt-6" aria-labelledby="near">
        <div className="flex items-baseline justify-between">
          <h2 id="near" className="font-display text-[22px] font-bold leading-7 text-foreground">{t("sh.disc.near")}</h2>
          <span className="text-meta text-muted-foreground">{t("sh.disc.shopsN", { n: shops.length })}</span>
        </div>
        <Link href="/map" className="relative mt-3 block h-[132px] overflow-hidden rounded-card border border-line bg-tile-mint shadow-card focus-visible:focus-ring">
          <svg aria-hidden width="100%" height="132" viewBox="0 0 358 132" preserveAspectRatio="none" className="absolute inset-0">
            <g strokeWidth="9" fill="none" strokeLinecap="round" className="stroke-card"><path d="M120 -10 L 170 140" /><path d="M-10 44 L 370 28" /><path d="M-10 100 L 370 86" /></g>
          </svg>
          <span aria-hidden className="absolute left-[calc(42%-7px)] top-[64px] size-[15px] rounded-full border-2 border-card bg-location" />
          {nearPins.map((s, i) => (
            <span key={s.merchant.id} aria-hidden className={cn("absolute flex size-8 items-center justify-center rounded-full bg-card shadow-card", i === 0 ? "left-[27%] top-4" : "left-[51%] top-[58px]")}>
              <CategoryIcon vertical={s.merchant.vertical} size={20} />
            </span>
          ))}
          <span className="absolute bottom-3 start-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-meta-strong text-primary-foreground shadow-glow"><MapPin aria-hidden className="size-4" />{t("sh.disc.openMap")}</span>
        </Link>
      </section>

      {rows.map((r, i) => (
        <section key={r.id} className={cn(i === 0 ? "mt-6" : "mt-7")} aria-labelledby={`row-${r.id}`}>
          <h2 id={`row-${r.id}`} className="font-display text-[22px] font-bold leading-7 text-foreground">{name ? t("sh.disc.rowOn", { kind: t(ROW_KEY[r.id]), street: name }) : t("sh.disc.rowNear", { kind: t(ROW_KEY[r.id]) })}</h2>
          <ul className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4">
            {r.shops.slice(0, 12).map((s) => (
              <li key={s.merchant.id} className="w-[168px] shrink-0 overflow-hidden rounded-card border border-line bg-card shadow-card">
                <Link href={`/shops/${s.merchant.slug}`} className="block pb-3 focus-visible:focus-ring">
                  <span data-trade={s.merchant.vertical} className="relative flex h-[140px] items-center justify-center bg-trade-soft">
                    <CategoryIcon vertical={s.merchant.vertical} size={76} />
                    {ready.has(s.merchant.id) ? <span className="absolute left-2.5 top-2.5 inline-flex h-6 items-center rounded-full bg-tile-butter px-2.5 text-caption font-bold text-tile-butter-foreground">{t("sh.wallet.rewardReady")}</span> : null}
                  </span>
                  <span className="mt-2.5 line-clamp-2 px-3 text-body-strong text-foreground">{s.merchant.name}</span>
                  <span className="mt-0.5 block truncate px-3 text-meta text-muted-foreground">{[placeKindLabel(locale, s.merchant.vertical), s.distanceMetres != null ? `${Math.round(s.distanceMetres / 10) * 10} m` : null, s.openNow ? t("sh.disc.open") : null].filter(Boolean).join(" · ")}</span>
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
