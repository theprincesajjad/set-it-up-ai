"use client";
import type { networkApi } from "@ll/shared";
import { ShopLogo } from "@/components/ui/ShopTile";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/format";

/**
 * Corner-style pin (references.md §1): round logo (or coloured initials) with a white ring and a
 * short name label; marigold balance badge on my shops; pine dot when a promo is live; selected
 * pin is larger and lifted. `moreCount` > 0 means overlapping shops were folded into this pin
 * (my shops win the collision pass): a "+N" badge zooms in on them.
 */
export function MapPin({ shop, selected, onSelect, showLabel = true, compact = false, moreCount = 0, onExpand }: { shop: networkApi.ShopListItemDto; selected: boolean; onSelect: () => void; showLabel?: boolean; compact?: boolean; moreCount?: number; onExpand?: () => void }) {
  const name = shop.merchant.name;
  const short = name.length > 14 ? `${name.slice(0, 13)}…` : name;
  const pin = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      aria-label={`${name}${shop.isMember && shop.myBalance != null ? `, ${formatPoints(shop.myBalance, shop.terminology)}` : ""}${shop.hasPromo ? ", has an offer" : ""}`}
      className="group flex cursor-pointer flex-col items-center gap-1 focus-visible:outline-none"
    >
      <span className={cn("relative rounded-full bg-[#FFFFFF] p-[2px] shadow-md transition-transform duration-150 ease-standard group-focus-visible:focus-ring", selected ? "scale-[1.3] ring-2 ring-brand" : "group-hover:scale-110")}>
        <ShopLogo shop={shop.merchant} size={compact && !selected ? 32 : 40} tone="solid" className="!rounded-full" />
        {shop.isMember && shop.myBalance != null ? (
          <span className="absolute -end-2.5 -top-2 min-w-6 rounded-full border-2 border-[#FFFFFF] bg-accent px-1 text-center text-[11px] font-bold leading-4 tabular-nums text-on-accent">{shop.myBalance > 999 ? "999+" : shop.myBalance}</span>
        ) : null}
        {shop.hasPromo ? <span aria-hidden className="absolute -bottom-0.5 -end-0.5 size-3.5 rounded-full border-2 border-[#FFFFFF] bg-brand" /> : null}
      </span>
      {showLabel || selected ? <span className={cn("max-w-28 truncate rounded-full px-1.5 text-[11px] font-semibold leading-4 text-fg shadow-sm", selected ? "mt-1.5 bg-fg text-fg-inverse" : "bg-surface/95")}>{short}</span> : null}
    </button>
  );
  if (!moreCount || !onExpand) return pin;
  return (
    <span className="relative flex flex-col items-center">
      {pin}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExpand();
        }}
        aria-label={`${moreCount} more ${moreCount === 1 ? "shop" : "shops"} here, zoom in`}
        className="absolute -start-4 -top-2 z-[1] inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-full border-2 border-[#FFFFFF] bg-fg px-1 text-[11px] font-bold tabular-nums text-fg-inverse shadow-md focus-visible:focus-ring"
      >
        +{moreCount}
      </button>
    </span>
  );
}

/** Count bubble for overlapping shops (none of them mine). Tap zooms in on the group. */
export function MapCluster({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onExpand();
      }}
      aria-label={`${count} shops here, zoom in`}
      className="group flex cursor-pointer flex-col items-center focus-visible:outline-none"
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full border-[3px] border-[#FFFFFF] bg-brand text-label font-bold tabular-nums text-on-brand shadow-md ring-4 ring-brand/25 transition-transform duration-150 ease-standard group-hover:scale-110 group-focus-visible:focus-ring">
        {count}
      </span>
    </button>
  );
}
