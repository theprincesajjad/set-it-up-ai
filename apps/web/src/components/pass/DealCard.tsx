"use client";
/**
 * One deal as a customer sees it (wave N, promo team): the promo card, the card colour the owner picked, a door crasher's live
 * counter and its "Save my spot" button, and the code to show at the counter. The owner's preview renders this same card.
 */
import { formatDate, type promosApi } from "@ll/shared";
import { Clock, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PromoCard } from "@/components/ui/PromoCard";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { cn } from "@/lib/cn";

/** Owner-picked card colours are design-token tile fills (no raw colours). */
export const DEAL_TILE: Record<promosApi.PromoColor, string> = {
  peach: "bg-tile-peach",
  mint: "bg-tile-mint",
  butter: "bg-tile-butter",
  lilac: "bg-tile-lilac",
  sky: "bg-tile-sky",
  rose: "bg-tile-rose",
};

export interface DealCardProps {
  deal: promosApi.DealDto;
  terminology?: string | null;
  /** Save a spot (door crashers). Absent in the owner's preview. */
  onClaim?: () => void;
  claiming?: boolean;
  error?: string | null;
  highlight?: boolean;
}

export function DealCard({ deal, terminology, onClaim, claiming, error, highlight }: DealCardProps) {
  const { t, locale } = useLocaleOrEnglish();
  const capped = deal.quantityCap != null;
  const left = deal.remaining ?? 0;
  const soldOut = capped && left <= 0 && !deal.claim;
  return (
    <div
      data-testid="deal-card"
      data-deal-id={deal.id}
      className={cn("flex flex-col gap-0 overflow-hidden rounded-card", deal.color ? `${DEAL_TILE[deal.color]} p-1.5` : "", highlight ? "ring-2 ring-fg" : "")}
    >
      <div className="relative">
        <PromoCard
          variant="feed"
          promo={{ ...deal, quantityCap: null }}
          terminology={terminology}
          shop={{ name: deal.merchant.name, vertical: deal.merchant.vertical, logoUrl: deal.merchant.logoUrl, brandColor: deal.merchant.brandColor }}
          href={`/shops/${deal.merchant.slug}`}
        />
        <div className="absolute end-3 top-3 flex gap-1.5">
          {deal.unread ? <Badge tone="accent">{t("deal.new")}</Badge> : null}
          {deal.activeNow ? <Badge tone="success">{t("deal.onNow")}</Badge> : null}
        </div>
      </div>
      {deal.upcoming || capped ? (
        <div className={cn("flex flex-wrap items-center justify-between gap-3 px-3 py-3", deal.color ? "" : "border-x border-b border-line bg-card")}>
          <div className="flex min-w-0 flex-col gap-0.5">
            {deal.upcoming ? (
              <span className="inline-flex items-center gap-1.5 text-meta-strong text-fg">
                <Clock aria-hidden className="size-4" />
                {t("deal.starts", { date: formatDate(locale, deal.startsAt, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) })}
              </span>
            ) : null}
            {capped ? (
              <span className="text-meta text-fg" aria-live="polite" data-testid="deal-remaining">
                {soldOut ? t("deal.soldOut") : left === 1 ? t("deal.oneSpotLeft") : t("deal.spotsLeft", { n: left })}
              </span>
            ) : null}
          </div>
          {deal.claim ? (
            <p className="inline-flex items-center gap-1.5 text-meta-strong text-fg" data-testid="deal-claim-code">
              <Ticket aria-hidden className="size-4" />
              {deal.claim.status === "redeemed" ? t("deal.used") : t("deal.claimed", { code: deal.claim.code })}
            </p>
          ) : capped && onClaim && !soldOut ? (
            deal.upcoming ? (
              <span className="text-meta text-fg-muted">{t("deal.notStarted")}</span>
            ) : (
              <button
                type="button"
                onClick={onClaim}
                disabled={claiming}
                className="inline-flex min-h-11 items-center rounded-pill bg-primary px-4 text-meta-strong text-primary-foreground focus-visible:focus-ring disabled:opacity-60"
              >
                {t("deal.claim")}
              </button>
            )
          ) : null}
          {error ? <p role="alert" className="w-full text-meta text-negative">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
