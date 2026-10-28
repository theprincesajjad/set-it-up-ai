"use client";
import { placeKindLabel, type networkApi } from "@ll/shared";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { unitsText } from "@/lib/units";
import type { L } from "@/lib/i18n/formatL";

/** The italic grey line under a place name: my balance, a live offer, or what kind of place it is. */
export function pinSubtitle(L: L, shop: networkApi.ShopListItemDto): string {
  if (shop.isMember && shop.myBalance != null) return L.t("wp.map.yourBal", { amount: unitsText(L.locale, shop.myBalance, shop.terminology, false) });
  if (shop.hasPromo) return L.t("wp.map.offerNow");
  return placeKindLabel(L.locale, shop.merchant.vertical);
}

/**
 * Corner-style place (foundations.md "Places are objects, not markers"): a small round white
 * bubble (34px, 22px object) holding the shop's object illustration (or its logo), the name in
 * 13px semibold black and one 12px italic grey line beside it, 6px apart. The tap target stays 44px
 * (invisible). My shops get a small accent dot (activity). The bubble's centre is the shop's
 * location (the marker is anchored "left" with a -17px offset).
 * `moreCount` > 0: overlapping shops were folded into this pin; a "+N" bubble zooms in on them.
 */
export function MapPin({ shop, selected, onSelect, showLabel = true, compact = false, moreCount = 0, onExpand }: { shop: networkApi.ShopListItemDto; selected: boolean; onSelect: () => void; showLabel?: boolean; compact?: boolean; moreCount?: number; onExpand?: () => void }) {
  const L = useLocaleOrEnglish();
  const { t, locale } = L;
  const name = shop.merchant.name;
  const sub = pinSubtitle(L, shop);
  const size = compact && !selected ? 28 : 34;
  return (
    <span className="relative flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        aria-pressed={selected}
        aria-label={`${name}${shop.isMember && shop.myBalance != null ? `, ${unitsText(locale, shop.myBalance, shop.terminology)}` : ""}${shop.hasPromo ? `, ${t("wp.map.hasOffer")}` : ""}`}
        className="group relative flex cursor-pointer items-center gap-1.5 focus-visible:outline-none"
      >
        <span className="relative flex w-[34px] shrink-0 justify-center after:absolute after:-inset-[5px] after:content-['']">
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full bg-card shadow-float transition-transform duration-150 ease-out group-focus-visible:focus-ring",
            selected ? "scale-[1.15] ring-2 ring-foreground" : "group-hover:scale-105",
          )}
          style={{ width: size, height: size }}
        >
          {shop.merchant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.merchant.logoUrl} alt="" className="size-[calc(100%-6px)] rounded-full object-cover" />
          ) : (
            <CategoryIcon vertical={shop.merchant.vertical} size={Math.round(size * 0.65)} />
          )}
          {shop.isMember ? <span aria-hidden className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-[1.5px] border-card bg-points" /> : null}
        </span>
        </span>
        {showLabel || selected ? (
          <span className="flex max-w-[150px] flex-col items-start text-start [text-shadow:0_0_2px_var(--ll-color-bg),0_0_3px_var(--ll-color-bg),0_0_5px_var(--ll-color-bg)]">
            <span className="line-clamp-2 w-full text-[13px] font-semibold leading-[15px] tracking-[-0.01em] text-fg"><bdi>{name}</bdi></span>
            <span className="w-full truncate text-[12px] italic leading-[14px] text-fg-muted">{sub}</span>
          </span>
        ) : null}
      </button>
      {moreCount && onExpand ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand();
          }}
          aria-label={t("wp.map.moreHere", { n: moreCount })}
          className="absolute -start-1.5 -top-1.5 z-[1] inline-flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground after:absolute after:-inset-3 after:content-[''] focus-visible:focus-ring"
        >
          +{moreCount}
        </button>
      ) : null}
    </span>
  );
}

/** Count bubble for overlapping shops (none of them mine): a small black capsule with the number. Tap zooms in. */
export function MapCluster({ count, onExpand }: { count: number; onExpand: () => void }) {
  const { t } = useLocaleOrEnglish();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
      aria-label={t("ms.map.shopsHere", { n: count })}
      className="group relative flex w-[34px] cursor-pointer items-center justify-center after:absolute after:-inset-[5px] after:content-[''] focus-visible:outline-none"
    >
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-[1.5px] border-background bg-primary px-1.5 text-[12px] font-semibold tabular-nums text-primary-foreground shadow-float transition-transform duration-150 ease-out group-hover:scale-105 group-focus-visible:focus-ring">
        {count}
      </span>
    </button>
  );
}
