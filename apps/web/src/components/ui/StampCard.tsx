"use client";
import { Gift } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { withArticle } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { unitCaption } from "@/lib/units";
import { stampIcon } from "@/components/pass/stampIcons";

export interface StampCardProps {
  stamps: number;
  goal: number;
  rewardName?: string;
  vertical?: string;
  /** Index (0-based) of stamps that just landed: animates stamp-pop. */
  newlyEarned?: number[];
  header?: ReactNode;
  className?: string;
  terminology?: string;
  /** "card" (hairline block, default) or "plain" (no box, inside a sheet or list). */
  frame?: "card" | "plain";
  /** "default" stamps in the trade colour on a card; "onTrade" white stamps for the pass card's gradient (text reads on `--trade-foreground`). */
  tone?: "default" | "onTrade";
  /** Just the stamp grid: no "n more" line or n / goal counter (the pass card prints its own numeral). */
  bare?: boolean;
}

/**
 * Stamp grid (Main Street Warm, Figma 35:2 and 35:199): earned stamps are solid dots in the shop's trade colour carrying the trade's stamp
 * glyph (cup, scissors, fork and knife ...), unearned ones are dashed rings and the last slot is the gift. On the pass card (`tone="onTrade"`)
 * the stamps are white on the gradient. A stamp that just landed pops in (motion-safe only).
 */
export function StampCard({ stamps, goal, rewardName, vertical, newlyEarned = [], header, className, terminology = "stamps", frame = "card", tone = "default", bare }: StampCardProps) {
  const Glyph = stampIcon(vertical);
  const onTrade = tone === "onTrade";
  const { t, locale } = useLocaleOrEnglish();
  const rewardLabel = rewardName ?? t("ui.reward").toLowerCase();
  const g = Math.max(1, Math.min(12, goal || 10));
  const onCard = stamps >= g ? g : stamps % g;
  const ready = stamps >= g;
  const carry = stamps > g ? stamps - g : 0;
  const cols = g <= 6 ? g : g === 8 ? 4 : g === 9 ? 5 : g === 10 ? 5 : 6;
  const toGo = Math.max(0, g - onCard);
  const reward = `${rewardLabel.charAt(0).toLowerCase()}${rewardLabel.slice(1)}`;

  return (
    <div className={cn(frame === "card" && "rounded-card border border-border bg-card p-4", className)}>
      {bare ? null : <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          {header ?? (
            <p className="text-body-strong text-fg">{ready ? <span className="text-points-text">{t("ui.stampReady", { reward: rewardLabel })}</span> : t("ui.stampMore", { n: toGo, reward: locale === "en" ? withArticle(reward) : reward })}</p>
          )}
        </div>
        {/* "2 / 6" reads left to right in every language (an Urdu page would otherwise show "6 / 2"). */}
        <span dir="ltr" className="shrink-0 text-meta tabular-nums text-fg-muted">
          <span className="font-semibold text-fg">{onCard}</span> / {g}
        </span>
      </div>}
      <div role="img" aria-label={`${t("sh.rc.progress", { have: onCard, need: g, unit: unitCaption(locale, 2, terminology) })}. ${ready ? t("ui.stampReady", { reward: rewardLabel }) : t("ui.stampMore", { n: toGo, reward: locale === "en" ? withArticle(rewardLabel) : rewardLabel })}.`} className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: g }, (_, i) => {
          const filled = i < onCard;
          const last = i === g - 1;
          return (
            <div key={i} aria-hidden className="flex items-center justify-center">
              <div
                className={cn(
                  "flex aspect-square w-full max-w-12 items-center justify-center rounded-full",
                  filled ? (onTrade ? "bg-trade-pass-text text-trade-pass-from" : "bg-trade text-trade-foreground") : onTrade ? "border-[1.5px] border-dashed border-current/70 text-trade-pass-text" : last ? "border-[1.5px] border-dashed border-trade/60 text-trade-deep" : "border-[1.5px] border-dashed border-line-strong text-muted-foreground",
                  filled && newlyEarned.includes(i) && "motion-safe:animate-stamp-pop",
                )}
              >
                {filled ? <Glyph className="size-[45%]" strokeWidth={2} /> : last ? <Gift className="size-[40%]" strokeWidth={1.75} /> : null}
              </div>
            </div>
          );
        })}
      </div>
      {carry > 0 ? <p className="mt-3 text-meta text-fg-muted">{t("wp.ui.carry", { n: carry })}</p> : null}
    </div>
  );
}
