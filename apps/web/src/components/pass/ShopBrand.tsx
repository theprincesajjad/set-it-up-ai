"use client";
/**
 * The shop's own colour on its customer screens (lib/shopColor.ts): the mark, and the pass-style hero card used by the join success, the
 * join steps and the booking confirmation. Everything reads the `--trade*` variables, so the card wears the shop's brand colour when a
 * `shopColorProps` scope is above it (else its trade colour), in Clear and Warm, light and dark. Text on the colour is `--trade-pass-text`,
 * which design-tokens picks for 4.5:1 against the fill.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { shopInitials } from "@/lib/shopAvatar";
import { shopColorProps } from "@/lib/shopColor";

export interface BrandShop {
  name: string;
  vertical?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
}

const SIZES = { 32: "size-8 rounded-r2 text-[12px]", 40: "size-10 rounded-r3 text-[14px]", 44: "size-11 rounded-r3 text-[15px]", 52: "size-[52px] rounded-r4 text-[17px]", 56: "size-14 rounded-r4 text-[18px]" } as const;

/**
 * The shop's mark in its colour: the logo, else its initials. `onColor` is for a mark that sits on the colour (a white tile, initials in the
 * colour, like the Wallet pass); otherwise the tile is the colour with the computed text colour on it.
 */
export function BrandMark({ shop, size = 44, onColor, className }: { shop: BrandShop; size?: keyof typeof SIZES; onColor?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = SIZES[size];
  if (shop.logoUrl && !failed)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={shop.logoUrl} alt="" width={size} height={size} onError={() => setFailed(true)} className={cn("shrink-0 bg-qr-bg object-cover", box, className)} />;
  return (
    <span
      aria-hidden
      data-testid="brand-mark"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-bold tracking-wide",
        onColor ? "bg-trade-pass-text text-trade-pass-from" : "bg-trade text-trade-foreground",
        box,
        className,
      )}
    >
      {shopInitials(shop.name)}
    </span>
  );
}

/**
 * A pass-style card on the shop's colour (the Clear pass, the Wallet card preview): the mark and name on top, then whatever the screen puts
 * in it (a headline, the stamps). `scope` also sets the colour variables on the card itself, for screens without a shop scope above.
 */
export function BrandPassCard({ shop, kicker, aside, children, className, scope, as: Tag = "section", ...rest }: { shop: BrandShop; kicker?: ReactNode; aside?: ReactNode; children?: ReactNode; className?: string; scope?: boolean; as?: "section" | "div"; "aria-label"?: string; "data-testid"?: string }) {
  return (
    <Tag
      {...(scope ? shopColorProps({ vertical: shop.vertical, brandColor: shop.brandColor }) : {})}
      {...rest}
      data-brand-card=""
      className={cn("relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-trade p-5 text-trade-pass-text shadow-card clear:rounded-r8", className)}
    >
      <div className="flex items-center gap-3">
        <BrandMark shop={shop} size={44} onColor />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-5 tracking-[-0.01em]"><bdi>{shop.name}</bdi></p>
          {kicker ? <p className="truncate text-meta">{kicker}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {children}
    </Tag>
  );
}

/** A row of small stamps on the colour (a preview of the card before joining): earned are solid, the last is the reward, accented. */
export function MiniStamps({ goal, filled = 0, className }: { goal: number; filled?: number; className?: string }) {
  const g = Math.max(1, Math.min(12, goal || 10));
  return (
    <div aria-hidden className={cn("flex flex-wrap gap-1.5", className)}>
      {Array.from({ length: g }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-5 rounded-full",
            i < filled ? "bg-trade-pass-text" : i === g - 1 ? "border-[1.5px] border-trade-pass-text bg-trade-pass-text/25" : "border-[1.5px] border-trade-pass-text/60",
          )}
        />
      ))}
    </div>
  );
}

/**
 * The top of a shop's page: its cover (when it has one) and a card in its colour with the mark, the name (the page's h1), what kind of
 * place it is, and the card on offer ("6 stamps = $10 off your next visit") over a row of stamps with the reward slot accented.
 */
export function ShopHero({ shop, subtitle, offer, goal = 0, coverUrl }: { shop: BrandShop; subtitle?: ReactNode; offer?: ReactNode; goal?: number; coverUrl?: string | null }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {coverUrl && !coverFailed ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-card bg-muted clear:rounded-r6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="size-full object-cover" onError={() => setCoverFailed(true)} />
        </div>
      ) : null}
      <div data-testid="shop-hero" data-brand-card="" className="flex flex-col gap-4 rounded-[28px] bg-trade p-5 text-trade-pass-text shadow-card clear:rounded-r8">
        <div className="flex items-center gap-3.5">
          <BrandMark shop={shop} size={56} onColor />
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-bold leading-[34px] tracking-[-0.022em]"><bdi>{shop.name}</bdi></h1>
            {subtitle ? <p className="text-body">{subtitle}</p> : null}
          </div>
        </div>
        {offer ? (
          <div className="flex flex-col gap-2.5 border-t border-trade-pass-text/30 pt-4">
            {goal > 0 ? <MiniStamps goal={goal} /> : null}
            <p className="text-body-strong">{offer}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The empty wallet's picture: three small shop cards fanned out, each in a trade colour (nail pink, café brown, grocer green), so an empty
 * /me still shows what it will hold. Decorative.
 */
export function CardFan() {
  const cards = [
    { vertical: "nails", rotate: "-rotate-[10deg] -translate-x-10" },
    { vertical: "cafe", rotate: "rotate-0 z-10" },
    { vertical: "grocery", rotate: "rotate-[10deg] translate-x-10" },
  ];
  return (
    <div aria-hidden data-testid="card-fan" className="relative flex h-24 w-48 items-center justify-center">
      {cards.map((c) => (
        <div key={c.vertical} {...shopColorProps({ vertical: c.vertical })} className={cn("absolute flex h-20 w-32 flex-col justify-between rounded-r5 bg-trade p-2.5 shadow-card", c.rotate)}>
          <span className="size-5 rounded-r2 bg-trade-pass-text/90" />
          <span className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("size-3 rounded-full", i < 2 ? "bg-trade-pass-text" : "border border-trade-pass-text/70")} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
