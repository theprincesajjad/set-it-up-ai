"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
// l10n-ok: English branch (locale === "en") keeps the hand-written formats
import { formatDate } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { rewardNameIn } from "@/lib/i18n/rewardName";
import { unitCaption, unitsText } from "@/lib/units";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";

export interface RewardCardReward {
  name: string;
  pointsCost: number;
  rewardType: "amount_off" | "percent_off" | "free_item" | "custom";
  value: number;
  terms?: string | null;
  description?: string | null;
}

export interface RewardCardProps {
  reward: RewardCardReward;
  balance?: number;
  terminology: string;
  /** "preview" = public shop page (no balance, no button). */
  state: "available" | "locked" | "redeeming" | "redeemed" | "preview";
  onRedeem?: () => void;
  redeemedAt?: string | null;
  /** Rendered while `redeeming` (usually <RedeemCode/>). */
  children?: ReactNode;
  className?: string;
  /** "card" (hairline block, default) or "row" (inside a ListGroup). */
  layout?: "card" | "row";
}

/** A reward: name + cost; a Redeem button when affordable, thin progress when not. No icon tiles. */
export function RewardCard({ reward, balance = 0, terminology, state, onRedeem, redeemedAt, children, className, layout = "card" }: RewardCardProps) {
  const { t, locale, date } = useLocaleOrEnglish();
  const toGo = Math.max(0, reward.pointsCost - balance);
  return (
    <div className={cn(layout === "card" ? "rounded-card border border-line bg-bg p-4" : "py-3.5", className)}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-fg">{rewardNameIn(locale, t, reward.name)}</p>
          <p className="text-meta tabular-nums text-fg-muted">
            {state === "available" ? <span className="font-semibold text-accent-text">{t("sh.rc.ready")} · </span> : null}
            {unitsText(locale, reward.pointsCost, terminology)}
          </p>
        </div>
        {state === "available" && onRedeem ? (
          <Button size="sm" onClick={onRedeem}>
            {t("sh.rc.redeem")}
          </Button>
        ) : null}
        {state === "locked" ? <span className="shrink-0 text-meta tabular-nums text-fg-muted">{t("sh.wallet.toGo", { amount: unitsText(locale, toGo, terminology) })}</span> : null}
        {state === "redeemed" ? <Badge tone="neutral">{redeemedAt ? t("sh.rc.redeemedOn", { date: locale === "en" ? formatDate(redeemedAt) : date(redeemedAt, { month: "short", day: "numeric" }) }) : t("sh.wallet.redeemed")}</Badge> : null}
      </div>
      {state === "locked" ? (
        <ProgressBar className="mt-3" value={Math.min(balance, reward.pointsCost)} max={reward.pointsCost} showValue={false} valueText={t("sh.rc.progress", { have: balance, need: reward.pointsCost, unit: locale === "en" ? terminology : unitCaption(locale, 2, terminology) })} />
      ) : null}
      {reward.description || reward.terms ? <p className="mt-2 text-meta text-fg-muted">{reward.terms ?? reward.description}</p> : null}
      {state === "redeeming" ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
