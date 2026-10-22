"use client";
/**
 * The full-bleed network map (foundations.md "Customer app · Explore", Corner): near-white basemap,
 * object pins, and chrome that floats — a round home button, a search capsule and a map/list
 * switch on top, lowercase filter capsules under them, the category rail of objects at the bottom,
 * a white "show all" circle and the one black element (locate me). Tapping a pin opens the shop
 * sheet (a bottom sheet on phones, a floating panel on desktop). maplibre-gl loads lazily; without
 * WebGL or tiles the page falls back to the list (`onFail`).
 */
import { LocateFixed, Maximize2, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { networkApi } from "@ll/shared";
import { categoryLabels } from "@ll/design-tokens";
import { LogoMark } from "@/components/site/Brand";
import { StatusDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ShopLogo } from "@/components/ui/ShopTile";
import { Spinner } from "@/components/ui/Spinner";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { cn } from "@/lib/cn";
import { formatDistance, formatPoints } from "@/lib/format";
import { FilterRow, type FinderState } from "./ShopFinder";

const NetworkMap = dynamic(() => import("./NetworkMap"), { ssr: false, loading: () => <div className="absolute inset-0 bg-ll-map-land dark:bg-ll-map-land-dark" /> });

export function ShopMap({ items, state, notice, onDismissNotice, onFail }: { items: networkApi.ShopListItemDto[]; state: FinderState; notice?: string | null; onDismissNotice?: () => void; onFail: (reason: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [fitAll, setFitAll] = useState(0);
  const located = items.filter((s) => s.location?.lat != null && s.location?.lng != null);
  const sel = located.find((s) => s.merchant.id === selected) ?? null;

  // The map owns the viewport: no page scroll behind it.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[30] overflow-hidden bg-ll-map-land dark:bg-ll-map-land-dark">
      <h1 className="sr-only">Shops near you</h1>
      <NetworkMap items={items} selected={sel?.merchant.id ?? null} onSelect={setSelected} me={state.coords} onFail={onFail} fitAllSignal={fitAll} onBackgroundTap={() => setSelected(null)} />

      {/* Top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex flex-col gap-2.5 px-4 pt-[max(12px,env(safe-area-inset-top))] md:px-6 md:pt-5">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link href="/" aria-label="Home" className="chrome inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:focus-ring">
            <LogoMark size={22} />
          </Link>
          <label className="chrome relative flex h-11 min-w-0 flex-1 items-center rounded-full md:max-w-[420px]">
            <span className="sr-only">Search shops</span>
            <Search aria-hidden className="pointer-events-none absolute start-3.5 size-[18px] text-fg-muted" strokeWidth={1.75} />
            <input
              type="search"
              placeholder="search shops"
              value={state.q}
              onChange={(e) => state.setQ(e.target.value)}
              className="h-full w-full min-w-0 rounded-full bg-transparent ps-10 pe-4 text-body text-fg outline-none placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-fg"
            />
          </label>
          <div className="md:ms-auto">
            <SegmentedControl label="View" value={state.view} onChange={state.setView} options={[{ value: "map", label: "Map" }, { value: "list", label: "List" }]} floating />
          </div>
        </div>
        <div className="pointer-events-auto">
          <FilterRow state={state} floating />
        </div>
        {notice ? (
          <div className="chrome pointer-events-auto flex items-start gap-3 rounded-card px-4 py-3 text-meta text-fg md:max-w-[420px]">
            <p className="flex-1">{notice}</p>
            <button type="button" aria-label="Dismiss" onClick={onDismissNotice} className="text-fg-muted hover:text-fg">
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
        {!located.length ? <p className="chrome pointer-events-auto w-fit rounded-full px-4 py-2 text-meta text-fg">nothing here with these filters</p> : null}
      </div>

      {/* Map controls (right) */}
      <div className={cn("pointer-events-none absolute end-4 z-[2] flex flex-col items-end gap-2.5 transition-[bottom] duration-200 ease-sheet md:end-6", sel ? "bottom-[calc(268px+env(safe-area-inset-bottom))] md:bottom-[136px]" : "bottom-[calc(124px+env(safe-area-inset-bottom))] md:bottom-[136px]")}>
        <button type="button" aria-label="Show all shops" title="Show all shops" onClick={() => setFitAll((n) => n + 1)} className="chrome pointer-events-auto inline-flex size-11 items-center justify-center rounded-full text-fg focus-visible:focus-ring">
          <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label={state.coords ? "Sorted by distance from you" : "Use my location"}
          title="Use my location"
          onClick={state.locate}
          className="pointer-events-auto inline-flex size-12 items-center justify-center rounded-full bg-fg text-bg shadow-float focus-visible:focus-ring"
        >
          {state.locating ? <Spinner className="size-5" /> : <LocateFixed aria-hidden className="size-5" strokeWidth={1.75} />}
        </button>
      </div>

      {/* Category rail of objects */}
      {state.categories.length > 2 ? (
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-[2] pb-[max(16px,env(safe-area-inset-bottom))] md:pb-6", sel && "max-md:hidden")}>
          <div role="group" aria-label="Categories" className="no-scrollbar pointer-events-auto mx-auto flex w-fit max-w-full gap-1 overflow-x-auto px-3 pt-2">
            {state.categories.map((c) => {
              const on = state.cat === c;
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => state.setCat(c)} className="group flex w-[58px] shrink-0 flex-col items-center gap-1 focus-visible:outline-none">
                  <span className={cn("flex size-12 items-center justify-center rounded-full bg-[#FFFFFF] shadow-float transition-transform duration-150 ease-out group-focus-visible:focus-ring", on ? "ring-2 ring-[#0B0B0C]" : "group-hover:scale-105")}>
                    <CategoryIcon category={c} size={30} />
                  </span>
                  <span className={cn("display text-category-label lowercase [text-shadow:0_0_3px_#fff,0_0_6px_#fff]", on ? "text-[#0B0B0C]" : "text-[#6B6B70]")}>{categoryLabels[c]}</span>
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
  const kind = verticalLabel(s.merchant.vertical).toLowerCase();
  const where = s.distanceMetres != null ? formatDistance(s.distanceMetres) : s.location?.address;
  return (
    <section
      aria-live="polite"
      aria-label={s.merchant.name}
      className="absolute inset-x-0 bottom-0 z-[3] rounded-t-sheet bg-bg px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-float motion-safe:animate-sheet-up md:inset-x-auto md:start-6 md:bottom-6 md:w-[380px] md:rounded-sheet md:p-5 md:motion-safe:animate-fade-in"
    >
      <div aria-hidden className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-bg-muted md:hidden" />
      <div className="flex items-start gap-3">
        <ShopLogo shop={s.merchant} size={56} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-headline text-fg">{s.merchant.name}</h2>
          <p className="truncate text-meta italic text-fg-muted">{[kind, where].filter(Boolean).join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg">
            {s.openNow != null ? <StatusDot tone={s.openNow ? "positive" : "neutral"}>{s.openNow ? "Open now" : "Closed"}</StatusDot> : null}
            {s.memberCount ? <span className="text-fg-muted">{s.memberCount} neighbours are members</span> : null}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="relative -me-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted after:absolute after:-inset-2 hover:text-fg focus-visible:focus-ring">
          <X aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </div>
      {s.isMember && s.myBalance != null ? (
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-meta text-fg-muted">Your balance</span>
          <span className="display text-title tabular-nums text-accent-text">{formatPoints(s.myBalance, s.terminology, false)}</span>
        </div>
      ) : s.hasPromo ? (
        <p className="mt-4 border-t border-line pt-3 text-meta text-fg">An offer is on now. Members hear about new ones first.</p>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button size="lg" fullWidth href={`/shops/${s.merchant.slug}`}>
          {s.isMember ? "View" : "Join"}
        </Button>
      </div>
    </section>
  );
}
