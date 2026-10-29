"use client";
/** Pieces the "This week" tile and Reports, Week share: the change chips, the goal bar and the trend bars. */
import { Check, TrendingUp, Trophy } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import type { reportsApi } from "@ll/shared";
import { StatChip } from "@/components/ui/ClearKit";
import { barHeights, deltaTone, goalProgress } from "@/lib/dashboard/insights";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** "$240 ahead of last week" (green, with the arrow), "$80 behind last week" (neutral), and "Your best week in 8 weeks" when it is one. */
export function DeltaChips({ w, className }: { w: reportsApi.WeekInsight; className?: string }) {
  const { t, money } = useLocaleOrEnglish();
  const ahead = w.deltaCents > 0;
  const text = ahead
    ? t("insights.line.ahead", { amount: money(w.deltaCents) })
    : w.deltaCents < 0
      ? t("insights.line.behind", { amount: money(-w.deltaCents) })
      : w.revenueCents === 0 && w.previous.revenueCents === 0
        ? null
        : t("insights.line.same");
  const aboveAvg = !ahead && w.fourWeekAvgCents > 0 && w.revenueCents > w.fourWeekAvgCents;
  if (!text && !w.bestWeekOfEight) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {text ? (
        <span data-testid="week-delta" className="inline-flex">
          <StatChip tone={deltaTone(w)} icon={ahead ? TrendingUp : undefined}>
            {text}
          </StatChip>
        </span>
      ) : null}
      {w.bestWeekOfEight ? (
        <StatChip tone="info" icon={Trophy}>
          {t("insights.tile.best", { n: w.trend.length })}
        </StatChip>
      ) : aboveAvg ? (
        <StatChip tone="up">{t("insights.tile.aboveAvg")}</StatChip>
      ) : null}
    </div>
  );
}

/** The goal as a thin bar that fills from empty on arrival, with its line under it. Nothing when there is no goal. */
export function GoalBar({ goal }: { goal: reportsApi.WeekInsight["goal"] }) {
  const { t, money } = useLocaleOrEnglish();
  const g = goalProgress(goal);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!g || !goal.cents) return null;
  const label = t("insights.tile.goalOf", { pct: g.pct, goal: money(goal.cents) });
  return (
    <div className="flex flex-col gap-1.5">
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, g.pct)} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full w-(--w) transition-all duration-700 ease-out", goal.reached ? "bg-success" : "bg-chart-hi")} style={{ "--w": shown ? `${g.width}%` : "0%" } as CSSProperties} />
      </div>
      <p className={cn("flex items-center gap-1.5 text-meta", goal.reached ? "font-semibold text-success-text" : "text-fg-muted")}>
        {goal.reached ? <Check aria-hidden className="size-3.5" strokeWidth={2.6} /> : null}
        {goal.reached ? t("insights.tile.goalDone", { goal: money(goal.cents) }) : label}
      </p>
    </div>
  );
}

/** Booked each week as bars, the current week in the trade colour. Decorative: the numbers are in the text beside it. */
export function TrendBars({ trend, className }: { trend: reportsApi.WeekTrendPoint[]; className?: string }) {
  const { t } = useLocaleOrEnglish();
  const heights = barHeights(trend);
  return (
    <div role="img" aria-label={t("insights.tile.trend", { n: trend.length })} className={cn("flex h-12 items-end gap-1", className)} dir="ltr">
      {heights.map((h, i) => (
        <span key={trend[i]!.weekStart} className={cn("h-(--h) flex-1 rounded-sm", i === heights.length - 1 ? "bg-chart-hi" : "bg-chart-muted")} style={{ "--h": `${Math.max(h, 2)}%` } as CSSProperties} />
      ))}
    </div>
  );
}
