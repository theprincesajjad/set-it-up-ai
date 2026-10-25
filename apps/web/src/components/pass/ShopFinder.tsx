"use client";
/**
 * /map: the network, Corner-style (foundations.md "Explore"). Map first: a full-bleed near-white
 * map with floating capsule chrome (ShopMap). The list is one tap away and is the fallback when
 * the map can't load (no WebGL / tiles).
 */
import { ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { placeKindLabel, type MessageKey, type networkApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { distanceL } from "@/lib/i18n/formatL";
import { unitsText } from "@/lib/units";
import { Banner } from "@/components/ui/Banner";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ShopTile } from "@/components/ui/ShopTile";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { MAP_CATEGORIES, inCategory, type MapCategoryId } from "./mapStyle";
import { ShopMap } from "./ShopMap";

export interface ShopFinderProps {
  initial: networkApi.ShopListItemDto[];
  neighbourhoods: networkApi.NeighbourhoodDto[];
  neighbourhood?: string | null;
}

export type Toggle = "mine" | "open" | "offers";
/** Catalog key for each filter capsule (shown lowercase). */
export const TOGGLE_KEYS: Record<Toggle, MessageKey> = { mine: "ms.aud.mine", open: "ms.map.openNow", offers: "sh.set.groupOffers" };
/** Catalog key for each category caption on the rail and the list filter. */
export const CATEGORY_KEYS: Record<MapCategoryId, MessageKey> = {
  all: "ms.cat.all",
  coffee: "sh.disc.row.coffee",
  bakery: "ms.cat.bakery",
  eat: "ms.cat.eat",
  shops: "sh.disc.row.shops",
  beauty: "sh.disc.row.beauty",
  repair: "sh.disc.row.repair",
  services: "sh.disc.row.services",
} as Record<MapCategoryId, MessageKey>;

/** Everything the map chrome and the list share. */
export interface FinderState {
  q: string;
  setQ: (q: string) => void;
  cat: MapCategoryId;
  setCat: (c: MapCategoryId) => void;
  toggles: Set<Toggle>;
  flip: (t: Toggle) => void;
  availableToggles: Toggle[];
  categories: MapCategoryId[];
  hood: string | null;
  setHood: (h: string | null) => void;
  neighbourhoods: networkApi.NeighbourhoodDto[];
  coords: { lat: number; lng: number } | null;
  locate: () => void;
  locating: boolean;
  view: "list" | "map";
  setView: (v: "list" | "map") => void;
}

export function ShopFinder({ initial, neighbourhoods, neighbourhood: initialHood }: ShopFinderProps) {
  const { t } = useLocaleOrEnglish();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<MapCategoryId>("all");
  const [toggles, setToggles] = useState<Set<Toggle>>(new Set());
  const [hood, setHood] = useState<string | null>(initialHood ?? null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const first = useRef(true);
  const [view, setView] = useState<"list" | "map">("map");
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await browserApi.network.shops({ q: q.trim() || undefined, neighbourhood: coords ? undefined : hood ?? undefined, lat: coords?.lat, lng: coords?.lng, limit: 100 });
        setItems(r.items);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, hood, coords]);

  function locate() {
    if (!("geolocation" in navigator)) return setNotice(t("cp.err.location"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setNotice(null);
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        setNotice(t("cp.err.location"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  const flip = (t: Toggle) =>
    setToggles((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const availableToggles: Toggle[] = [...(items.some((s) => s.isMember) ? (["mine"] as const) : []), ...(items.some((s) => s.openNow != null) ? (["open"] as const) : []), ...(items.some((s) => s.hasPromo) ? (["offers"] as const) : [])];
  const categories = MAP_CATEGORIES.filter((c) => c === "all" || items.some((s) => inCategory(s.merchant.vertical, c)));
  const shown = useMemo(
    () =>
      items.filter(
        (s) => inCategory(s.merchant.vertical, cat) && (!toggles.has("mine") || s.isMember) && (!toggles.has("open") || s.openNow === true) && (!toggles.has("offers") || s.hasPromo),
      ),
    [items, cat, toggles],
  );

  const state: FinderState = { q, setQ, cat, setCat, toggles, flip, availableToggles, categories, hood, setHood, neighbourhoods, coords, locate, locating, view, setView };

  if (view === "map" && !mapFailed && items.length) {
    return <ShopMap items={shown} state={state} notice={notice} onDismissNotice={() => setNotice(null)} onFail={() => setMapFailed(true)} />;
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-end justify-between gap-3 pt-2">
        <h1 className="display text-large-title text-fg">{t("wp.t.mapTitle")}</h1>
        <SegmentedControl label={t("wp.map.viewLabel")} value={view} onChange={setView} options={[{ value: "map", label: t("sh.nav.map") }, { value: "list", label: t("wp.map.list") }]} />
      </div>
      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">{t("sh.wallet.search")}</span>
          <Search aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-muted" strokeWidth={1.75} />
          <input type="search" placeholder={t("wp.map.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="h-11 w-full rounded-full bg-bg-subtle ps-10 pe-4 text-body text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-fg" />
        </label>
        <FilterRow state={state} />
        {categories.length > 2 ? (
          <div role="group" aria-label={t("wp.cat.label")} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {categories.map((c) => (
              <Chip key={c} selected={cat === c} onClick={() => setCat(c)} icon={<CategoryIcon category={c} size={18} />}>
                {t(CATEGORY_KEYS[c])}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
      {notice ? <Banner tone="info">{notice}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {mapFailed && view === "map" ? <Banner tone="info">{t("wp.map.failed")}</Banner> : null}
      <div id="list" aria-live="polite" aria-busy={loading}>
        {loading && !items.length ? (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : shown.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {shown.map((s) => (
              <li key={s.merchant.id}>
                <ShopTile
                  variant="list"
                  href={`/shops/${s.merchant.slug}`}
                  shop={{ name: s.merchant.name, vertical: s.merchant.vertical, logoUrl: s.merchant.logoUrl, brandColor: s.merchant.brandColor }}
                  subtitle={<ShopLine s={s} />}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Search}
            title={q ? t("cp.empty.mapSearchTitle", { query: q }) : t("cp.empty.noHoodTitle")}
            description={q ? t("cp.empty.mapSearchBody") : t("cp.empty.noHoodBody")}
            action={q ? <Button variant="secondary" onClick={() => setQ("")}>{t("ms.map.clearSearch")}</Button> : undefined}
          />
        )}
      </div>
    </div>
  );
}

/** One line of facts under a shop name: kind, distance, open, my balance. */
export function ShopLine({ s }: { s: networkApi.ShopListItemDto }) {
  const L = useLocaleOrEnglish();
  const { t, locale } = L;
  const bits = [locale === "en" ? verticalLabel(s.merchant.vertical) : placeKindLabel(locale, s.merchant.vertical), s.distanceMetres != null ? distanceL(L, s.distanceMetres) : s.location?.address].filter(Boolean);
  return (
    <span className="inline-flex min-w-0 items-center gap-x-2">
      <span className="truncate">{bits.join(" · ")}</span>
      {s.openNow != null ? <StatusDot tone={s.openNow ? "positive" : "neutral"} className="shrink-0">{s.openNow ? t("ui.hours.open") : t("ui.hours.closed")}</StatusDot> : null}
      {s.isMember && s.myBalance != null ? <span className="shrink-0 font-semibold text-accent-text">{unitsText(locale, s.myBalance, s.terminology)}</span> : null}
    </span>
  );
}

/** Neighbourhood capsule + filter capsules ("my shops", "open now", "offers"), lowercase. */
export function FilterRow({ state, floating }: { state: FinderState; floating?: boolean }) {
  const { neighbourhoods, hood, setHood, coords, availableToggles, toggles, flip } = state;
  const { t } = useLocaleOrEnglish();
  const current = neighbourhoods.find((n) => n.slug === hood);
  return (
    <div role="group" aria-label={t("rc.mn.filters")} className={cn("no-scrollbar flex gap-2 overflow-x-auto", floating ? "-mx-4 px-4 py-1" : "-mx-4 px-4")}>
      {neighbourhoods.length > 1 && !coords ? (
        <label className={cn("relative inline-flex h-9 shrink-0 items-center gap-1 rounded-full ps-3.5 pe-3 text-meta-strong text-fg", floating ? "bg-bg shadow-float" : "border border-line bg-bg")}>
          <span className="sr-only">{t("wp.map.hood")}</span>
          <span aria-hidden>{(current?.name ?? t("wp.map.everywhere")).toLowerCase()}</span>
          <ChevronDown aria-hidden className="size-3.5 text-fg-muted" strokeWidth={2} />
          <select value={hood ?? ""} onChange={(e) => setHood(e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0">
            <option value="">{t("wp.map.everywhere").replace(/^./, (ch) => ch.toUpperCase())}</option>
            {neighbourhoods.map((n) => (
              <option key={n.slug} value={n.slug}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {availableToggles.map((tg) => (
        <Chip key={tg} selected={toggles.has(tg)} onClick={() => flip(tg)} floating={floating}>
          {t(TOGGLE_KEYS[tg]).toLowerCase()}
        </Chip>
      ))}
    </div>
  );
}
