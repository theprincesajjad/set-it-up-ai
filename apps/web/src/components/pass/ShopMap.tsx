"use client";
/**
 * The full-bleed network map (foundations.md "Customer app · Explore", Corner): near-white basemap,
 * object pins, and chrome that floats — a round home button, a search capsule and a map/list
 * switch on top, lowercase filter capsules under them, the category rail of objects at the bottom,
 * a white "show all" circle and the one black element (locate me). Tapping a pin opens the shop
 * sheet (a bottom sheet on phones, a floating panel on desktop). maplibre-gl loads lazily; without
 * WebGL or tiles the page falls back to the list (`onFail`).
 */
import { useHydratedValue } from "@/lib/useHydratedValue";
import { LocateFixed, Maximize2, Search, X } from "lucide-react";
import { placeKindLabel } from "@ll/shared";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { networkApi } from "@ll/shared";
import { LogoMark } from "@/components/site/Brand";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ShopLogo } from "@/components/ui/ShopTile";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { distanceL } from "@/lib/i18n/formatL";
import { unitsText } from "@/lib/units";
import { Chip } from "@/components/ui/Chip";
import { shopInitials } from "@/lib/shopAvatar";
import { pinSubtitle } from "./MapPin";
import { CATEGORY_KEYS, FilterRow, type FinderState } from "./ShopFinder";
import { usePassStyle } from "./useThemeStyle";

const NetworkMap = dynamic(() => import("./NetworkMap"), { ssr: false, loading: () => <div className="absolute inset-0 bg-ll-map-land dark:bg-ll-map-land-dark" /> });

type ShopMapProps = { items: networkApi.ShopListItemDto[]; state: FinderState; notice?: string | null; onDismissNotice?: () => void; onFail: (reason: string) => void };

export function ShopMap(props: ShopMapProps) {
  return usePassStyle() === "clear" ? <ClearShopMap {...props} /> : <WarmShopMap {...props} />;
}

/** The map owns the viewport: no page scroll behind it. */
function useNoPageScroll() {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);
}

/**
 * The map in Clear (v3.2-clear-audit.md #7, #25, #26 and 2.4 "Map sheet"; v6 mock `?s=map`): Liquid Glass chrome over the full-bleed map.
 * Top (y 12, 16 gutter): a 44 home circle and the Map / List control (a 44 glass capsule, inset 2, 40 segments). Under it on the end edge,
 * a glass stack of two 44 buttons (show all, locate me). At the bottom, the glass sheet: 358 x 384 at 390 (16 from the sides and the bottom,
 * r32), a 36 x 5 grabber, the 40 search pill, one row of filter and category chips, the "near you" caps label and the nearest shops as 64
 * rows (36 r12 shop marks in each shop's trade colour, content x 32, dividers overlaid). Tapping a pin or a row turns the same sheet into
 * that shop's card; its close button goes back to the list.
 */
function ClearShopMap({ items, state, notice, onDismissNotice, onFail }: ShopMapProps) {
  const searchRef = useHydratedValue<HTMLInputElement>(state.q, state.setQ);
  const L = useLocaleOrEnglish();
  const { t } = L;
  const [selected, setSelected] = useState<string | null>(null);
  const [fitAll, setFitAll] = useState(0);
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null);
  const sel = located.find((s) => s.merchant.id === selected) ?? null;
  const nearest = [...items].sort((a, b) => (a.distanceMetres ?? Number.MAX_SAFE_INTEGER) - (b.distanceMetres ?? Number.MAX_SAFE_INTEGER));
  useNoPageScroll();
  // The glass pieces are `absolute!`: the glass utilities set position: relative for their specular rim.
  return (
    <div className="fixed inset-0 z-[30] overflow-hidden bg-ll-map-land dark:bg-ll-map-land-dark">
      <h1 className="sr-only">{t("wp.t.mapTitle")}</h1>
      <NetworkMap items={items} selected={sel?.merchant.id ?? null} onSelect={setSelected} me={state.coords} onFail={onFail} fitAllSignal={fitAll} onBackgroundTap={() => setSelected(null)} padding={{ top: 80, bottom: 416, left: 32, right: 80 }} />

      {/* Top row: home, Map / List. */}
      <div data-map-obstacle className="absolute inset-x-4 top-[max(12px,env(safe-area-inset-top))] z-[2] flex items-center gap-2 md:inset-x-auto md:start-4 md:w-[358px]">
        <Link href="/" aria-label={t("auth.notFound.home")} data-lens className="glass-chrome inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground focus-visible:focus-ring">
          <LogoMark size={22} />
        </Link>
        <SegmentedControl label={t("wp.map.viewLabel")} value={state.view} onChange={state.setView} options={[{ value: "map", label: t("sh.nav.map") }, { value: "list", label: t("wp.map.list") }]} floating className="min-w-0 flex-1 [&>button]:flex-1" />
      </div>

      {/* Map buttons: one glass stack on the end edge, 44 each (audit 2.4 "circles 44 ... map stack"). */}
      <div data-map-obstacle data-lens data-lens-r="22" data-lens-bezel="18" className="glass-chrome absolute! end-4 top-[calc(max(12px,env(safe-area-inset-top))+60px)] z-[2] flex flex-col rounded-[22px]">
        <button type="button" aria-label={t("wp.map.showAll")} title={t("wp.map.showAll")} onClick={() => setFitAll((n) => n + 1)} className="inline-flex size-11 items-center justify-center rounded-t-[22px] text-foreground focus-visible:focus-ring">
          <Maximize2 aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label={state.coords ? t("wp.map.sorted") : t("ms.map.useLoc")} title={t("ms.map.useLoc")} onClick={state.locate} className="inline-flex size-11 items-center justify-center rounded-b-[22px] text-foreground focus-visible:focus-ring">
          {state.locating ? <Spinner className="size-5" /> : <LocateFixed aria-hidden className="size-5" strokeWidth={1.75} />}
        </button>
      </div>

      {notice || !located.length ? (
        <div data-map-obstacle className="absolute start-4 end-[76px] top-[calc(max(12px,env(safe-area-inset-top))+60px)] z-[2] flex flex-col gap-2 md:end-auto md:w-[290px]">
          {notice ? (
            <div className="glass-chrome flex items-start gap-3 rounded-r5 px-4 py-3 text-meta text-foreground">
              <p className="flex-1">{notice}</p>
              <button type="button" aria-label={t("wp.map.dismiss")} onClick={onDismissNotice} className="relative text-muted-foreground after:absolute after:-inset-3 hover:text-foreground">
                <X aria-hidden className="size-4" />
              </button>
            </div>
          ) : null}
          {!located.length ? <p className="glass-chrome w-fit rounded-full px-4 py-2 text-meta text-foreground">{t("wp.map.nothing")}</p> : null}
        </div>
      ) : null}

      {/* The glass bottom sheet. */}
      <section
        data-map-obstacle
        data-lens
        data-lens-r="32"
        data-lens-bezel="24"
        aria-label={sel ? sel.merchant.name : t("sh.disc.near")}
        className="glass-sheet absolute! inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-[3] flex h-[384px] flex-col overflow-hidden rounded-r9 md:inset-x-auto md:start-4 md:w-[358px]"
      >
        <div aria-hidden className="mx-auto mt-2 mb-[11px] h-[5px] w-9 shrink-0 rounded-full bg-muted-foreground/40" />
        {sel ? (
          <div data-trade={sel.merchant.vertical} aria-live="polite" className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <ShopSheetBody s={sel} onClose={() => setSelected(null)} />
          </div>
        ) : (
          <>
            <div className="shrink-0 px-4 pb-3">
              <label className="relative flex h-10 items-center rounded-full bg-lg-lift hairline-inset dark:bg-background/40">
                <span className="sr-only">{t("sh.wallet.search")}</span>
                <Search aria-hidden className="pointer-events-none absolute start-3 size-4 text-muted-foreground" strokeWidth={1.75} />
                <input
                  ref={searchRef}
                  type="search"
                  placeholder={t("wp.map.searchPh")}
                  value={state.q}
                  onChange={(e) => state.setQ(e.target.value)}
                  className="h-full w-full min-w-0 rounded-full bg-transparent ps-9 pe-4 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
            </div>
            {state.categories.length > 2 || state.availableToggles.length || state.neighbourhoods.length > 1 ? (
              <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2">
                <FilterRow state={state} inline />
                {state.categories.length > 2 ? (
                  <div role="group" aria-label={t("wp.cat.label")} className="flex shrink-0 gap-2">
                    {state.categories.map((c) => (
                      <Chip key={c} selected={state.cat === c} onClick={() => state.setCat(c)} icon={<CategoryIcon category={c} size={18} />}>
                        {t(CATEGORY_KEYS[c])}
                      </Chip>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="shrink-0 px-4 pt-2 pb-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted-foreground">{t("sh.disc.near")}</p>
            <ul className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-2 divide-overlay">
              {nearest.slice(0, 30).map((s) => (
                <li key={s.merchant.id} data-trade={s.merchant.vertical}>
                  <button type="button" onClick={() => setSelected(s.merchant.id)} className="flex min-h-16 w-full items-center gap-3 py-3 text-start focus-visible:focus-ring">
                    <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-r4 bg-trade text-[12px] font-semibold text-trade-foreground">{shopInitials(s.merchant.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-strong text-foreground"><bdi>{s.merchant.name}</bdi></span>
                      <span className="block truncate text-body text-muted-foreground">{pinSubtitle(L, s)}</span>
                    </span>
                    {s.distanceMetres != null ? <span className="inline-flex h-5 shrink-0 items-center rounded-r2 bg-lg-seg-track px-2 text-[12px] font-medium leading-4 tabular-nums text-foreground">{distanceL(L, s.distanceMetres)}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function WarmShopMap({ items, state, notice, onDismissNotice, onFail }: ShopMapProps) {
  const searchRef = useHydratedValue<HTMLInputElement>(state.q, state.setQ);
  const { t } = useLocaleOrEnglish();
  const [selected, setSelected] = useState<string | null>(null);
  const [fitAll, setFitAll] = useState(0);
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null);
  const sel = located.find((s) => s.merchant.id === selected) ?? null;

  useNoPageScroll();

  return (
    <div className="fixed inset-0 z-[30] overflow-hidden bg-ll-map-land dark:bg-ll-map-land-dark">
      <h1 className="sr-only">{t("wp.t.mapTitle")}</h1>
      <NetworkMap items={items} selected={sel?.merchant.id ?? null} onSelect={setSelected} me={state.coords} onFail={onFail} fitAllSignal={fitAll} onBackgroundTap={() => setSelected(null)} />

      {/* Top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex flex-col gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] md:px-6 md:pt-5">
        <div data-map-obstacle className="pointer-events-auto flex items-center gap-2 md:w-fit md:min-w-[560px]">
          <Link href="/" aria-label={t("auth.notFound.home")} className="chrome inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:focus-ring">
            <LogoMark size={22} />
          </Link>
          <label className="chrome relative flex h-11 min-w-0 flex-1 items-center rounded-full md:max-w-[420px]">
            <span className="sr-only">{t("sh.wallet.search")}</span>
            <Search aria-hidden className="pointer-events-none absolute start-3.5 size-[18px] text-fg-muted" strokeWidth={1.75} />
            <input
              ref={searchRef}
              type="search"
              placeholder={t("sh.wallet.search").toLowerCase()}
              value={state.q}
              onChange={(e) => state.setQ(e.target.value)}
              className="h-full w-full min-w-0 rounded-full bg-transparent ps-10 pe-4 text-body text-fg outline-none placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-fg"
            />
          </label>
          <div className="md:ms-auto">
            <SegmentedControl label={t("wp.map.viewLabel")} value={state.view} onChange={state.setView} options={[{ value: "map", label: t("sh.nav.map") }, { value: "list", label: t("wp.map.list") }]} floating />
          </div>
        </div>
        <div className="pointer-events-auto flex">
          <div data-map-obstacle className="max-w-full">
            <FilterRow state={state} floating />
          </div>
        </div>
        {notice ? (
          <div data-map-obstacle className="chrome pointer-events-auto flex items-start gap-3 rounded-card px-4 py-3 text-meta text-fg md:max-w-[420px]">
            <p className="flex-1">{notice}</p>
            <button type="button" aria-label={t("wp.map.dismiss")} onClick={onDismissNotice} className="text-fg-muted hover:text-fg">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
        {!located.length ? <p data-map-obstacle className="chrome pointer-events-auto w-fit rounded-full px-4 py-2 text-meta text-fg">{t("wp.map.nothing")}</p> : null}
      </div>

      {/* Map controls (right) */}
      <div data-map-obstacle className={cn("pointer-events-none absolute end-4 z-[3] flex flex-col items-end gap-2.5 transition-[bottom] duration-200 ease-sheet md:end-6", sel ? "bottom-[calc(252px+env(safe-area-inset-bottom))] md:bottom-[124px]" : "bottom-[calc(112px+env(safe-area-inset-bottom))] md:bottom-[124px]")}>
        {/* Desktop only: on phones the List switch already gives the overview. */}
        <button type="button" aria-label={t("wp.map.showAll")} title={t("wp.map.showAll")} onClick={() => setFitAll((n) => n + 1)} className="chrome pointer-events-auto hidden size-10 items-center justify-center rounded-full text-fg focus-visible:focus-ring md:inline-flex">
          <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={state.coords ? t("wp.map.sorted") : t("ms.map.useLoc")}
          title={t("ms.map.useLoc")}
          onClick={state.locate}
          className="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float focus-visible:focus-ring"
        >
          {state.locating ? <Spinner className="size-5" /> : <LocateFixed aria-hidden className="size-5" strokeWidth={1.75} />}
        </button>
      </div>

      {/* Category rail of objects, on a soft white fade so map labels never read through the captions. */}
      {state.categories.length > 2 ? (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[2]", sel && "max-md:hidden")}>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[112px] bg-linear-to-t from-bg from-35% via-bg/80 to-transparent dark:from-ll-map-land-dark dark:via-ll-map-land-dark/85 dark:to-transparent" />
          <div data-map-obstacle role="group" aria-label={t("wp.cat.label")} className="no-scrollbar pointer-events-auto relative mx-auto flex w-fit max-w-full gap-0.5 overflow-x-auto px-3 pt-2 pb-[max(22px,env(safe-area-inset-bottom))] md:pb-6">
            {state.categories.map((c) => {
              const on = state.cat === c;
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => state.setCat(c)} className="group flex w-[54px] shrink-0 flex-col items-center gap-1 focus-visible:outline-none">
                  <span className={cn("flex size-10 items-center justify-center rounded-full bg-card shadow-float transition-transform duration-150 ease-out group-focus-visible:focus-ring", on ? "bg-primary ring-2 ring-primary" : "group-hover:scale-105")}>
                    <CategoryIcon category={c} size={24} />
                  </span>
                  <span className={cn("text-caption font-semibold", on ? "text-primary-text" : "text-fg-muted")}>{t(CATEGORY_KEYS[c])}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {sel ? <ShopSheet s={sel} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

/** Shop sheet (foundations.md "Shop sheet"): grabber, avatar + name + italic vertical line, open dot, my progress, one black action. */
function ShopSheet({ s, onClose }: { s: networkApi.ShopListItemDto; onClose: () => void }) {
  return (
    <section
      data-map-obstacle
      data-trade={s.merchant.vertical}
      aria-live="polite"
      aria-label={s.merchant.name}
      className="absolute inset-x-0 bottom-0 z-[3] rounded-t-sheet border border-line bg-card px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-float motion-safe:animate-sheet-up md:inset-x-auto md:start-6 md:bottom-6 md:w-[380px] md:rounded-sheet md:p-5 md:motion-safe:animate-fade-in"
    >
      <div aria-hidden className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-bg-muted md:hidden" />
      <ShopSheetBody s={s} onClose={onClose} />
    </section>
  );
}

/** The shop card inside either sheet: logo, name (ink in Clear, trade-deep in Warm), kind and distance, open dot, my balance or the offer, one black action. */
function ShopSheetBody({ s, onClose }: { s: networkApi.ShopListItemDto; onClose: () => void }) {
  const L = useLocaleOrEnglish();
  const { t, locale } = L;
  const kind = placeKindLabel(locale, s.merchant.vertical);
  const where = s.distanceMetres != null ? distanceL(L, s.distanceMetres) : s.location?.address;
  return (
    <>
      <div className="flex items-start gap-3">
        <ShopLogo shop={s.merchant} size={56} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="font-display text-title font-bold text-trade-deep clear:text-foreground"><bdi>{s.merchant.name}</bdi></h2>
          <p className="truncate text-meta text-fg-muted">{[kind, where].filter(Boolean).join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg">
            {s.openNow != null ? <StatusDot tone={s.openNow ? "positive" : "neutral"}>{s.openNow ? t("ms.map.openNow").replace(/^./, (ch) => ch.toUpperCase()) : t("ui.hours.closed")}</StatusDot> : null}
            {s.memberCount ? <span className="text-fg-muted">{t("shop.membersCount", { n: s.memberCount })}</span> : null}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={t("sh.card.close")} className="relative -me-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted after:absolute after:-inset-2 hover:text-fg focus-visible:focus-ring clear:me-0 clear:size-10 clear:bg-lg-seg-track clear:text-foreground clear:after:-inset-0.5">
          <X aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </div>
      {s.isMember && s.myBalance != null ? (
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-meta text-fg-muted">{t("wp.map.balance")}</span>
          <span className="display text-title tabular-nums text-points-text">{unitsText(locale, s.myBalance, s.terminology, false)}</span>
        </div>
      ) : s.hasPromo ? (
        <p className="mt-4 border-t border-line pt-3 text-meta text-fg">{t("wp.map.offerOn")}</p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button size="lg" fullWidth href={`/shops/${s.merchant.slug}`}>
          {s.isMember ? t("wp.map.view") : t("sh.wallet.join")}
        </Button>
      </div>
    </>
  );
}
