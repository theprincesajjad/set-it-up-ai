import { Check, Gift } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

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
}

/**
 * Stamp row/grid (v2): earned stamps are solid accent dots with a check, unearned ones are hairline
 * rings with their number, the last slot is the gift. The accent here IS the points.
 */
export function StampCard({ stamps, goal, rewardName = "reward", newlyEarned = [], header, className, terminology = "stamps", frame = "card" }: StampCardProps) {
  const g = Math.max(1, Math.min(12, goal || 10));
  const onCard = stamps >= g ? g : stamps % g;
  const ready = stamps >= g;
  const carry = stamps > g ? stamps - g : 0;
  const cols = g <= 6 ? g : g === 8 ? 4 : g === 9 ? 5 : g === 10 ? 5 : 6;
  const toGo = Math.max(0, g - onCard);
  const reward = `${rewardName.charAt(0).toLowerCase()}${rewardName.slice(1)}`;

  return (
    <div className={cn(frame === "card" && "rounded-card border border-line bg-bg p-4", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          {header ?? (
            <p className="text-body-strong text-fg">{ready ? <span className="text-accent-text">{rewardName} is ready</span> : `${toGo} more for a ${reward}`}</p>
          )}
        </div>
        <span className="shrink-0 text-meta tabular-nums text-fg-muted">
          <span className="font-semibold text-fg">{onCard}</span> / {g}
        </span>
      </div>
      <div role="img" aria-label={`${onCard} of ${g} ${terminology}. ${ready ? `${rewardName} is ready.` : `${toGo} more for a ${rewardName}.`}`} className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: g }, (_, i) => {
          const filled = i < onCard;
          const last = i === g - 1;
          return (
            <div key={i} aria-hidden className="flex items-center justify-center">
              <div
                className={cn(
                  "flex aspect-square w-full max-w-12 items-center justify-center rounded-full",
                  filled ? "bg-accent text-on-accent" : last ? "border border-dashed border-line-strong/60 text-fg-muted" : "border border-line text-meta tabular-nums text-fg-subtle",
                  filled && newlyEarned.includes(i) && "motion-safe:animate-stamp-pop",
                )}
              >
                {last ? <Gift className="size-[18px]" strokeWidth={1.75} /> : filled ? <Check className="size-[18px]" strokeWidth={2.5} /> : i + 1}
              </div>
            </div>
          );
        })}
      </div>
      {carry > 0 ? <p className="mt-3 text-meta text-fg-muted">+{carry} on your next card</p> : null}
    </div>
  );
}
