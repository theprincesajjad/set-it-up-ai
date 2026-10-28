"use client";
import { BellOff, ChevronRight } from "lucide-react";
import { placeKindLabel } from "@ll/shared";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { distanceL } from "@/lib/i18n/formatL";
import { unitCaption } from "@/lib/units";
import { SponsoredBadge } from "./Badge";

export interface ShopTileShop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
  /** The shop's own colour: shown ONLY inside its avatar (foundations.md "Shop identity"). */
  brandColor?: string | null;
  coverUrl?: string | null;
  neighbourhood?: string | null;
  distanceM?: number | null;
}

export interface ShopTileProps {
  shop: ShopTileShop;
  balance?: { value: number; terminology: string; nextRewardAt?: number | null };
  variant?: "wallet" | "list" | "compact" | "hero";
  rewardReady?: boolean;
  muted?: boolean;
  sponsored?: boolean;
  /** Second line, e.g. "2 more stamps for a free drink" or "Open · closes 6 pm". */
  subtitle?: React.ReactNode;
  href?: string;
  className?: string;
}

export { onColor, shopInitials } from "@/lib/shopAvatar";
import { onColor, shopInitials } from "@/lib/shopAvatar";

/**
 * Shop avatar: round logo, or initials on the shop's own brandColor (neutral grey without one, or
 * black for `tone="solid"`). Falls back to initials when the logo fails to load. Never a blank square.
 */
export function ShopLogo({ shop, size = 48, className, tone = "tint" }: { shop: Pick<ShopTileShop, "name" | "vertical" | "logoUrl" | "brandColor">; size?: 24 | 32 | 40 | 44 | 48 | 52 | 56 | 64 | 72; className?: string; tone?: "tint" | "solid" }) {
  const [failed, setFailed] = useState(false);
  const px = { 24: "size-6 text-[9px]", 32: "size-8 text-[11px]", 40: "size-10 text-meta-strong", 44: "size-11 text-meta-strong", 48: "size-12 text-body-strong", 52: "size-[52px] text-[18px]", 56: "size-14 text-headline", 64: "size-16 text-title", 72: "size-[72px] text-title" }[size];
  if (shop.logoUrl && !failed)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={shop.logoUrl} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn("shrink-0 rounded-full bg-bg-subtle object-cover", px, className)} />;
  const brand = shop.brandColor && /^#[0-9a-f]{6}$/i.test(shop.brandColor) ? shop.brandColor : null;
  const style = brand ? { background: brand, color: onColor(brand) } : undefined;
  return (
    <span
      aria-hidden
      // Lowercase initials in the display face, same as the app's avatars (polish-audit W3).
      className={cn("display inline-flex shrink-0 select-none items-center justify-center rounded-full font-extrabold tracking-normal", !brand && (tone === "solid" ? "bg-fg text-bg" : "bg-bg-muted text-fg"), px, className)}
      style={style}
    >
      {shopInitials(shop.name).toLowerCase()}
    </span>
  );
}

export function ShopTile({ shop, balance, variant = "list", rewardReady, muted, sponsored, subtitle, href, className }: ShopTileProps) {
  const L = useLocaleOrEnglish();
  const { t, locale } = L;
  const [coverFailed, setCoverFailed] = useState(false);
  const name = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 truncate"><bdi>{shop.name}</bdi></span>
      {muted ? (
        <>
          <BellOff aria-hidden className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
          <span className="sr-only">{t("wp.ui.muted")}</span>
        </>
      ) : null}
    </span>
  );

  if (variant === "hero") {
    const hasCover = !!shop.coverUrl && !coverFailed;
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        {hasCover ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-card bg-bg-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shop.coverUrl!} alt="" className="size-full object-cover" onError={() => setCoverFailed(true)} />
          </div>
        ) : null}
        <div className="flex items-center gap-3.5">
          <ShopLogo shop={shop} size={64} />
          <div className="min-w-0 flex-1">
            {sponsored ? <SponsoredBadge /> : null}
            {/* Shop title: 22/600 like the app's shop sheet, never heavy (polish-audit M13). */}
            <h1 className="text-title font-semibold text-fg"><bdi>{shop.name}</bdi></h1>
            {subtitle ? <p className="mt-0.5 text-meta italic text-fg-muted">{subtitle}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const second = subtitle ?? ([shop.neighbourhood, shop.distanceM != null ? distanceL(L, shop.distanceM) : null].filter(Boolean).join(" · ") || null);
  const body = (
    <>
      <ShopLogo shop={shop} size={variant === "compact" ? 40 : 44} />
      <div className="min-w-0 flex-1">
        {sponsored ? <SponsoredBadge /> : null}
        {/* Name and balance share one baseline (polish-audit S11). */}
        <div className="flex items-baseline gap-3">
          <div className={cn("min-w-0 flex-1 text-body-strong text-fg", variant === "compact" && "[&_.truncate]:line-clamp-2 [&_.truncate]:whitespace-normal")}>{name}</div>
          {variant === "wallet" && balance ? (
            <span className="shrink-0 whitespace-nowrap">
              <span className={cn("text-headline tabular-nums", balance.value === 0 ? "text-fg-muted" : "text-points-text")}>{formatNumber(balance.value)}</span>
              <span className="text-meta text-fg-muted"> {unitCaption(locale, balance.value, balance.terminology)}</span>
            </span>
          ) : null}
        </div>
        {second ? <div className={cn("line-clamp-2 text-meta", rewardReady ? "text-points-text" : "text-fg-muted")}>{second}</div> : variant === "compact" ? <div className="truncate text-meta italic text-fg-muted">{placeKindLabel(locale, shop.vertical)}</div> : null}
      </div>
      {href && variant !== "compact" ? <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" /> : null}
    </>
  );
  const cls = cn(
    "flex items-center gap-3",
    (variant === "wallet" || variant === "list") && "min-h-[64px] py-2.5",
    variant === "compact" && "min-h-14 rounded-card border border-line bg-card p-2.5 pe-3",
    href && "transition-colors duration-150 ease-out focus-visible:focus-ring",
    href && variant === "compact" && "hover:bg-bg-subtle",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
