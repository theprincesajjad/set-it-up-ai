"use client";
import { useEffect, useState } from "react";
import { formatClock, formatMoney } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { StatusDot } from "./Badge";
import { ShopLogo } from "./ShopTile";

/** Show-to-save card with a live ticking clock so screenshots can't be reused (system.md §6). v2: white, hairline, no tint. */
export function DiscountCard({ card, shop, memberName, live = true }: { card: { name: string; percentOff: number; amountOffCents: number; terms: string | null }; shop: { name: string; vertical: string; logoUrl?: string | null; brandColor?: string | null }; memberName?: string | null; live?: boolean }) {
  const { t, locale, money } = useLocaleOrEnglish();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!live) return;
    // Live clock: starts on the client only (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const value = card.percentOff > 0 ? t("ui.promoOff", { n: card.percentOff }) : card.amountOffCents > 0 ? t("ui.amountOff", { amount: locale === "en" ? formatMoney(card.amountOffCents) : money(card.amountOffCents) }) : card.name;
  return (
    <div className="flex aspect-[1.586] w-full max-w-sm flex-col justify-between rounded-card border border-line bg-card p-5 text-fg">
      <div className="flex items-center gap-2">
        <ShopLogo shop={shop} size={24} />
        <span className="truncate text-meta-strong">{shop.name}</span>
      </div>
      <div>
        <p className="display text-display-number tabular-nums">{value}</p>
        <p className="text-body-strong">{card.name}</p>
        {card.terms ? <p className="mt-0.5 text-meta text-fg-muted">{card.terms}</p> : null}
      </div>
      {live ? (
        <div className="flex items-center justify-between gap-2 text-meta text-fg-muted">
          <span>
            {memberName ?? t("wp.ui.member")} · <span className="tabular-nums text-fg">{now ? formatClock(now) : ""}</span>
          </span>
          <StatusDot tone="positive">{t("ui.validToday")}</StatusDot>
        </div>
      ) : (
        <span className="text-meta text-fg-muted">{t("wp.ui.joinCarry")}</span>
      )}
    </div>
  );
}
