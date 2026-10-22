import { BellOff, Gift } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDistance, formatNumber, unitFor } from "@/lib/format";
import { Badge, SponsoredBadge } from "./Badge";
import { VerticalGlyph, verticalVar } from "./VerticalIcon";

export interface ShopTileShop {
  name: string;
  vertical: string;
  logoUrl?: string | null;
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

/** Shop logo, or the vertical placeholder (tint bg + lucide icon in accent). */
export function ShopLogo({ shop, size = 48, className }: { shop: Pick<ShopTileShop, "name" | "vertical" | "logoUrl">; size?: 24 | 40 | 48 | 56 | 72; className?: string }) {
  const px = { 24: "size-6 rounded-xs", 40: "size-10 rounded-md", 48: "size-12 rounded-md", 56: "size-14 rounded-md", 72: "size-[72px] rounded-lg" }[size];
  if (shop.logoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={shop.logoUrl} alt="" width={size} height={size} loading="lazy" decoding="async" className={cn("shrink-0 object-cover", px, className)} style={{ background: verticalVar(shop.vertical, "tint") }} />;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center", px, className)} style={{ background: verticalVar(shop.vertical, "tint"), color: verticalVar(shop.vertical, "accent") }}>
      <VerticalGlyph vertical={shop.vertical} className={size <= 24 ? "size-4" : size >= 72 ? "size-9" : "size-6"} />
    </span>
  );
}

export function ShopTile({ shop, balance, variant = "list", rewardReady, muted, sponsored, subtitle, href, className }: ShopTileProps) {
  const name = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{shop.name}</span>
      {muted ? (
        <>
          <BellOff aria-hidden className="size-4 shrink-0 text-fg-muted" />
          <span className="sr-only">(muted)</span>
        </>
      ) : null}
    </span>
  );

  if (variant === "hero") {
    return (
      <div className={cn("relative", className)}>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg" style={{ background: verticalVar(shop.vertical, "tint") }}>
          {shop.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <VerticalGlyph vertical={shop.vertical} className="absolute end-6 top-1/2 size-32 -translate-y-1/2 opacity-30" style={{ color: verticalVar(shop.vertical, "accent") }} />
          )}
        </div>
        {/* Logo overlaps the hero edge by half (references.md §5); name and meta sit below it. */}
        <div className="relative z-[1] -mt-9 ps-4">
          <ShopLogo shop={shop} size={72} className="ring-4 ring-canvas" />
        </div>
        <div className="mt-2 min-w-0">
          {sponsored ? <SponsoredBadge /> : null}
          <h1 className="text-h2 text-fg">{shop.name}</h1>
          {subtitle ? <p className="text-body-sm text-fg-muted">{subtitle}</p> : null}
        </div>
      </div>
    );
  }

  const size = variant === "compact" ? 40 : 48;
  const body = (
    <>
      <ShopLogo shop={shop} size={size} />
      <div className="min-w-0 flex-1">
        {sponsored ? <SponsoredBadge /> : null}
        <div className={cn("text-fg", variant === "compact" ? "text-label" : "text-title")}>{name}</div>
        {subtitle || shop.neighbourhood || shop.distanceM != null ? (
          <div className="truncate text-body-sm text-fg-muted">
            {subtitle ?? [shop.neighbourhood, shop.distanceM != null ? formatDistance(shop.distanceM) : null].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </div>
      {variant === "wallet" && balance ? (
        <div className="flex shrink-0 flex-col items-end">
          {rewardReady ? (
            <Badge tone="accent" icon={Gift}>
              Reward ready
            </Badge>
          ) : null}
          <span className="text-h3 tabular-nums text-fg-brand">{formatNumber(balance.value)}</span>
          <span className="text-caption text-fg-muted">{unitFor(balance.terminology, balance.value, false)}</span>
        </div>
      ) : null}
    </>
  );
  const cls = cn(
    "flex items-center gap-3",
    variant === "wallet" && "relative min-h-[88px] rounded-lg bg-surface p-4 shadow-sm",
    variant === "wallet" && rewardReady && "border-s-4 border-accent",
    variant === "list" && "min-h-16 py-2",
    variant === "compact" && "min-h-14 rounded-md bg-surface p-2 pe-3 shadow-sm",
    href && "transition-shadow hover:shadow-md focus-visible:focus-ring",
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
