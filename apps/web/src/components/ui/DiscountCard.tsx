"use client";
import { useEffect, useState } from "react";
import { formatClock, formatMoney } from "@/lib/format";
import { Badge } from "./Badge";
import { ShopLogo } from "./ShopTile";
import { verticalVar } from "./VerticalIcon";

/** Show-to-save card with a live ticking clock so screenshots can't be reused (system.md §6). */
export function DiscountCard({ card, shop, memberName, live = true }: { card: { name: string; percentOff: number; amountOffCents: number; terms: string | null }; shop: { name: string; vertical: string; logoUrl?: string | null }; memberName?: string | null; live?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!live) return;
    // Live clock: starts on the client only (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [live]);
  const value = card.percentOff > 0 ? `${card.percentOff}% off` : card.amountOffCents > 0 ? `${formatMoney(card.amountOffCents)} off` : card.name;
  return (
    <div className="flex aspect-[1.586] w-full max-w-sm flex-col justify-between rounded-xl p-5" style={{ background: verticalVar(shop.vertical, "tint"), color: verticalVar(shop.vertical, "ink") }}>
      <div className="flex items-center gap-2">
        <ShopLogo shop={shop} size={24} />
        <span className="text-label">{shop.name}</span>
      </div>
      <div>
        <p className="text-h1">{value}</p>
        <p className="text-body-strong">{card.name}</p>
        {card.terms ? <p className="text-caption">{card.terms}</p> : null}
      </div>
      {live ? (
        <div className="flex items-center justify-between gap-2 text-caption">
          <span>
            {memberName ?? "Member"} · <span className="tabular-nums">{now ? formatClock(now) : ""}</span>
          </span>
          <Badge tone="success">Valid today</Badge>
        </div>
      ) : (
        <span className="text-caption">Join to carry this card</span>
      )}
    </div>
  );
}
