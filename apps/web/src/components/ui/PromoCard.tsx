"use client";
import { formatDate as formatDateL10n } from "@ll/shared";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { formatDate } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { distanceL, promoWhenL, type L } from "@/lib/i18n/formatL";
import { unitCaption, unitsText } from "@/lib/units";
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
  daysOfWeek?: number[] | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface PromoCardProps {
  promo: PromoCardPromo;
  shop: ShopTileShop;
  /** Sponsored placements are ALWAYS labelled (brand.md §8, ux-copy §6). */
  sponsored?: { advertiser: string; reason?: string; street?: string } | null;
  variant?: "feed" | "compact" | "preview";
  href?: string;
  /** The shop's own word ("stamps", "points") so "2x" is never "2x points" in a stamp shop. */
  terminology?: string | null;
  /** False on the shop's own page, where every card is that shop's. */
  showShop?: boolean;
}

function kindBadge(p: PromoCardPromo, L: L, terminology?: string | null) {
  const { t, locale } = L;
  if (p.kind === "multiplier") return <Badge tone="accent">{p.multiplierPct ? (terminology ? `${p.multiplierPct / 100}x ${unitCaption(locale, 2, terminology)}` : t("wp.ui.multiplier", { n: p.multiplierPct / 100 })) : t("wp.ui.bonusPoints")}</Badge>;
  if (p.kind === "bonus_points") return <Badge tone="accent">{p.bonusPoints ? (terminology && terminology !== "points" ? `+${unitsText(locale, p.bonusPoints, terminology, false)}` : t("ui.promoPts", { n: p.bonusPoints })) : t("wp.ui.bonusPoints")}</Badge>;
  if (p.kind === "discount") return <Badge tone="neutral">{p.percentOff ? t("ui.promoOff", { n: p.percentOff }) : t("wp.ui.discount")}</Badge>;
  if (p.kind === "event") return <Badge tone="neutral">{t("rc.ca.type")}</Badge>;
  void locale;
  return null;
}

function meta(p: PromoCardPromo, L: L) {
  const { t, locale } = L;
  const day = (d: Date, withWeekday = false) => (locale === "en" ? formatDate(d, withWeekday) : formatDateL10n(locale, d, { month: "short", day: "numeric", ...(withWeekday ? { weekday: "short" } : {}) }));
  if (p.endsAt) {
    const end = new Date(p.endsAt);
    const days = (end.getTime() - Date.now()) / 86_400_000;
    if (days < 1) return t("ui.promoToday");
    if (days < 7) return t("ui.promoEndsDay", { day: formatDateL10n(locale, end, { weekday: "short" }) });
    return t("ui.promoEndsDate", { date: day(end) });
  }
  if (p.startsAt && new Date(p.startsAt).getTime() > Date.now()) return t("wp.ui.startsOn", { date: day(new Date(p.startsAt), true) });
  return p.activeNow === false ? t("wp.ui.selectedDays") : null;
}

export function PromoCard({ promo, shop, sponsored, variant = "feed", href, terminology, showShop = true }: PromoCardProps) {
  const L = useLocaleOrEnglish();
  const { t, locale } = L;
  const [why, setWhy] = useState(false);
  const when = promoWhenL(L, promo);
  // "On selected days" is what the schedule line below now says exactly.
  const m = when && !promo.endsAt && !(promo.startsAt && new Date(promo.startsAt).getTime() > Date.now()) ? null : meta(promo, L);
  const content = (
    <>
      {promo.imageUrl && variant === "feed" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={promo.imageUrl} alt="" loading="lazy" className="aspect-video w-full object-cover" />
      ) : null}
      <div className="flex flex-col gap-2 p-4">
        {showShop ? (
          <div className="flex items-center gap-2">
            <ShopLogo shop={shop} size={24} />
            <span className="truncate text-meta-strong text-fg">{shop.name}</span>
            {shop.distanceM != null ? <span className="text-meta text-fg-muted">{distanceL(L, shop.distanceM)}</span> : null}
          </div>
        ) : null}
        <p className="line-clamp-2 text-headline text-fg">{promo.title}</p>
        {promo.body && variant !== "compact" ? <p className="line-clamp-2 text-meta text-fg-muted">{promo.body}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {kindBadge(promo, L, terminology)}
          {m ? <span className="text-meta text-fg-muted">{m}</span> : null}
        </div>
        {when ? <p className="text-meta text-fg">{when}</p> : null}
      </div>
    </>
  );
  return (
    <article aria-label={sponsored ? `${t("ui.sponsored")}. ${promo.title}` : promo.title} className="overflow-hidden rounded-card border border-line bg-bg">
      {sponsored ? (
        <div className="px-4 pt-3">
          <button type="button" onClick={() => setWhy(true)} className="rounded-full focus-visible:focus-ring" aria-haspopup="dialog">
            <Badge tone="neutral" iconEnd={Info}>
              {t("ui.sponsored")}
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
        <Modal open={why} onClose={() => setWhy(false)} title={t("cp.ad.whyTitle")} variant="sheet">
          <p className="text-body text-fg">{t("cp.ad.whyBody", { shop: sponsored.advertiser, street: sponsored.street ?? t("ms.map.yourStreet"), terminology: unitCaption(locale, 2, "points") })}</p>
          {sponsored.reason ? <p className="mt-2 text-meta text-fg-muted">{sponsored.reason}</p> : null}
          <p className="mt-4">
            <Link href="/me#settings" className="text-meta-strong text-fg underline underline-offset-2">
              {t("cp.ad.link")}
            </Link>
          </p>
        </Modal>
      ) : null}
    </article>
  );
}
