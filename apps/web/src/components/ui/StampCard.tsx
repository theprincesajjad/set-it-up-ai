import { Check, Gift } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { verticalIcon } from "./VerticalIcon";

/* Layout per docs/design/references.md §3 (Honest Greens stamp challenge): earned slots carry the
   shop's mark, unearned slots show their number, the last slot is a gift, and an "n / goal" pill sits top-right. */

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
}

const rot = (i: number) => (((i * 37) % 17) - 8); // deterministic -8..8 deg

/** Visual stamp grid (system.md §6 StampCard). */
export function StampCard({ stamps, goal, rewardName = "reward", vertical, newlyEarned = [], header, className, terminology = "stamps" }: StampCardProps) {
  const g = Math.max(1, Math.min(12, goal || 10));
  const onCard = stamps >= g ? g : stamps % g;
  const ready = stamps >= g;
  const carry = stamps > g ? stamps - g : 0;
  const cols = g === 10 ? 5 : g === 8 ? 4 : Math.min(6, Math.ceil(g / 2));
  const Icon = vertical ? verticalIcon(vertical) : Check;
  const toGo = Math.max(0, g - onCard);
  const caption = ready ? `${rewardName} is ready` : `${onCard} of ${g} · ${toGo} more for a ${rewardName.charAt(0).toLowerCase()}${rewardName.slice(1)}`;

  return (
    <div className={cn("relative rounded-lg bg-surface p-4 shadow-sm", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-accent-subtle px-2.5 text-caption font-semibold tabular-nums text-on-accent-subtle">
          {onCard} / {g}
        </span>
      </div>
      <div role="img" aria-label={`${onCard} of ${g} ${terminology}. ${ready ? `${rewardName} is ready.` : `${toGo} more for a ${rewardName}.`}`} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: g }, (_, i) => {
          const filled = i < onCard;
          const last = i === g - 1;
          return (
            <div key={i} aria-hidden className="flex aspect-square max-h-14 items-center justify-center">
              <div
                className={cn(
                  "flex aspect-square w-full max-w-14 items-center justify-center rounded-full",
                  filled ? (last ? "bg-brand text-on-brand" : "bg-accent text-on-accent") : "border-2 border-dashed border-stamp-empty text-label tabular-nums text-fg-muted",
                  filled && newlyEarned.includes(i) && "motion-safe:animate-stamp-pop",
                )}
                style={filled && !last ? { transform: `rotate(${rot(i)}deg)` } : undefined}
              >
                {last ? <Gift className="size-5" /> : filled ? <Icon className="size-5" /> : i + 1}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-body-sm text-fg">{caption}</p>
      {carry > 0 ? <p className="text-caption text-fg-muted">+{carry} on your next card</p> : null}
    </div>
  );
}
