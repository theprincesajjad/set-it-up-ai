"use client";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { copy } from "@/copy/en-CA";
import { formatDate, formatDistance } from "@/lib/format";
import { Badge } from "./Badge";
import { Modal } from "./Modal";
import { ShopLogo, type ShopTileShop } from "./ShopTile";

export interface PromoCardPromo {
  title: string;
  body?: string | null;
  kind: "offer" | "multiplier" | "bonus_points" | "discount" | "event";
  startsAt?: string | null;
  endsAt?: string | null;
  imageUrl?: string | null;
  multiplierPct?: number | null;
  bonusPoints?: number | null;
  percentOff?: number | null;
  activeNow?: boolean;
}

export interface PromoCardProps {
  promo: PromoCardPromo;
  shop: ShopTileShop;
  /** Sponsored placements are ALWAYS labelled (brand.md §8, ux-copy §6). */
  sponsored?: { advertiser: string; reason?: string; street?: string } | null;
  variant?: "feed" | "compact" | "preview";
  href?: string;
}

function kindBadge(p: PromoCardPromo) {
  if (p.kind === "multiplier") return <Badge tone="accent">{p.multiplierPct ? `${p.multiplierPct / 100}x points` : "Bonus points"}</Badge>;
  if (p.kind === "bonus_points") return <Badge tone="accent">{p.bonusPoints ? `+${p.bonusPoints} pts` : "Bonus points"}</Badge>;
  if (p.kind === "discount") return <Badge tone="brand">{p.percentOff ? `${p.percentOff}% off` : "Discount"}</Badge>;
  if (p.kind === "event") return <Badge tone="info">Event</Badge>;
  return null;
}

function meta(p: PromoCardPromo) {
  if (p.endsAt) {
    const end = new Date(p.endsAt);
    const days = (end.getTime() - Date.now()) / 86_400_000;
    if (days < 1) return "Today only";
    if (days < 7) return `Ends ${end.toLocaleDateString("en-CA", { weekday: "short", timeZone: "America/Toronto" })}`;
    return `Ends ${formatDate(end)}`;
  }
  if (p.startsAt && new Date(p.startsAt).getTime() > Date.now()) return `Starts ${formatDate(p.startsAt, true)}`;
  return p.activeNow === false ? "On selected days" : null;
}

export function PromoCard({ promo, shop, sponsored, variant = "feed", href }: PromoCardProps) {
  const [why, setWhy] = useState(false);
  const m = meta(promo);
  const content = (
    <>
      {promo.imageUrl && variant === "feed" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={promo.imageUrl} alt="" loading="lazy" className="aspect-video w-full rounded-t-lg object-cover" />
      ) : null}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <ShopLogo shop={shop} size={24} />
          <span className="truncate text-label text-fg">{shop.name}</span>
          {shop.distanceM != null ? <span className="text-caption text-fg-muted">{formatDistance(shop.distanceM)}</span> : null}
        </div>
        <p className="line-clamp-2 text-title text-fg">{promo.title}</p>
        {promo.body && variant !== "compact" ? <p className="line-clamp-2 text-body-sm text-fg-muted">{promo.body}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {kindBadge(promo)}
          {m ? <span className="text-body-sm text-fg-muted">{m}</span> : null}
        </div>
      </div>
    </>
  );
  return (
    <article aria-label={sponsored ? `${copy.ad.a11yPrefix} ${promo.title}` : promo.title} className="overflow-hidden rounded-lg bg-surface shadow-sm">
      {sponsored ? (
        <div className="px-4 pt-3">
          <button type="button" onClick={() => setWhy(true)} className="rounded-full focus-visible:focus-ring" aria-haspopup="dialog">
            <Badge tone="neutral" iconEnd={Info}>
              {copy.ad.label}
            </Badge>
          </button>
        </div>
      ) : null}
      {href ? (
        <Link href={href} className="block focus-visible:focus-ring">
          {content}
        </Link>
      ) : (
        content
      )}
      {sponsored ? (
        <Modal open={why} onClose={() => setWhy(false)} title={copy.ad.whyTitle} variant="sheet">
          <p className="text-body text-fg">{copy.ad.whyBody(sponsored.advertiser, sponsored.street ?? "your street")}</p>
          {sponsored.reason ? <p className="mt-2 text-body-sm text-fg-muted">{sponsored.reason}</p> : null}
          <p className="mt-4">
            <Link href="/me#settings" className="text-label text-fg-link underline">
              Ad settings
            </Link>
          </p>
        </Modal>
      ) : null}
    </article>
  );
}
