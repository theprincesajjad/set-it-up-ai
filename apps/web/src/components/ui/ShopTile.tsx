"use client";
import { BellOff, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatDistance, formatNumber, unitFor } from "@/lib/format";
import { SponsoredBadge } from "./Badge";
import { verticalLabel } from "./VerticalIcon";

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

/** "Pinecone Coffee Co." → "PC"; one word → first two letters. */
export function shopInitials(name: string): string {
  const words = name.replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s&]/gu, " ").split(/\s+/).filter((w) => w && !/^(the|and|&|of|co|inc|ltd)$/i.test(w));
  if (!words.length) return (name.trim()[0] ?? "?").toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Black or white text on a hex background (WCAG relative luminance). */
export function onColor(hex: string): "#FFFFFF" | "#0B0B0C" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#0B0B0C" : "#FFFFFF";
}

/**
 * Shop avatar: round logo, or initials on the shop's own brandColor (neutral grey without one, or
 * black for `tone="solid"`). Falls back to initials when the logo fails to load. Never a blank square.
 */
export function ShopLogo({ shop, size = 48, className, tone = "tint" }: { shop: Pick<ShopTileShop, "name" | "vertical" | "logoUrl" | "brandColor">; size?: 24 | 32 | 40 | 44 | 48 | 56 | 64 | 72; className?: string; tone?: "tint" | "solid" }) {
  const [failed, setFailed] = useState(false);
  const px = { 24: "size-6 text-[9px]", 32: "size-8 text-[11px]", 40: "size-10 text-meta-strong", 44: "size-11 text-meta-strong", 48: "size-12 text-body-strong", 56: "size-14 text-headline", 64: "size-16 text-title", 72: "size-[72px] text-title" }[size];
  if (shop.logoUrl && !failed)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={shop.logoUrl} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn("shrink-0 rounded-full bg-bg-subtle object-cover", px, className)} />;
  const brand = shop.brandColor && /^#[0-9a-f]{6}$/i.test(shop.brandColor) ? shop.brandColor : null;
  const style = brand ? { background: brand, color: onColor(brand) } : undefined;
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-[0.01em]", !brand && (tone === "solid" ? "bg-fg text-bg" : "bg-bg-muted text-fg"), px, className)}
      style={style}
    >
      {shopInitials(shop.name)}
    </span>
  );
}

export function ShopTile({ shop, balance, variant = "list", rewardReady, muted, sponsored, subtitle, href, className }: ShopTileProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const name = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="min-w-0 truncate">{shop.name}</span>
      {muted ? (
        <>
          <BellOff aria-hidden className="size-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
          <span className="sr-only">(muted)</span>
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
            <h1 className="display text-large-title text-fg">{shop.name}</h1>
            {subtitle ? <p className="mt-0.5 text-meta italic text-fg-muted">{subtitle}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const second = subtitle ?? ([shop.neighbourhood, shop.distanceM != null ? formatDistance(shop.distanceM) : null].filter(Boolean).join(" · ") || null);
  const body = (
    <>
      <ShopLogo shop={shop} size={variant === "compact" ? 40 : 44} />
      <div className="min-w-0 flex-1">
        {sponsored ? <SponsoredBadge /> : null}
        <div className={cn("text-body-strong text-fg", variant === "compact" && "[&_.truncate]:line-clamp-2 [&_.truncate]:whitespace-normal")}>{name}</div>
        {second ? <div className="truncate text-meta text-fg-muted">{second}</div> : variant === "compact" ? <div className="truncate text-meta italic text-fg-muted">{verticalLabel(shop.vertical).toLowerCase()}</div> : null}
      </div>
      {variant === "wallet" && balance ? (
        <div className="flex shrink-0 flex-col items-end">
          <span className="display text-title leading-7 tabular-nums text-accent-text">{formatNumber(balance.value)}</span>
          <span className="text-caption text-fg-muted">{rewardReady ? "reward ready" : unitFor(balance.terminology, balance.value, false)}</span>
        </div>
      ) : null}
      {href && variant !== "compact" ? <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-subtle" /> : null}
    </>
  );
  const cls = cn(
    "flex items-center gap-3",
    (variant === "wallet" || variant === "list") && "min-h-[64px] py-2.5",
    variant === "compact" && "min-h-14 rounded-card border border-line bg-bg p-2.5 pe-3",
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
