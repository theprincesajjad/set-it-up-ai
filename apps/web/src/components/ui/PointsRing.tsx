import { Gift } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber, unitFor } from "@/lib/format";

const SIZES = { 64: { stroke: 8, text: "text-[20px] leading-6" }, 120: { stroke: 10, text: "text-[32px] leading-9" }, 200: { stroke: 14, text: "text-points" } } as const;

export interface PointsRingProps {
  balance: number;
  /** Cost of the next reward; ring shows balance / goal. */
  goal: number;
  terminology?: string;
  rewardName?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  showCaption?: boolean;
}

/** Circular progress to the next reward (system.md §6 PointsRing). */
export function PointsRing({ balance, goal, terminology = "points", rewardName, size = 120, className, showCaption = true }: PointsRingProps) {
  const { stroke, text } = SIZES[size];
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ready = goal > 0 && balance >= goal;
  const pct = goal > 0 ? Math.min(1, balance / goal) : 0;
  const toGo = Math.max(0, goal - balance);
  const unit = unitFor(terminology, balance);
  const a11y = goal > 0
    ? `${formatNumber(balance)} of ${formatNumber(goal)} ${terminology}.${rewardName ? ready ? ` ${rewardName} is ready.` : ` ${toGo} ${terminology} to ${rewardName}.` : ""}`
    : `${formatNumber(balance)} ${terminology}.`;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div role="img" aria-label={a11y} className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ring-track" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (ready ? 1 : pct))}
            className={cn("transition-[stroke-dashoffset] duration-[600ms] ease-standard", ready ? "stroke-accent" : "stroke-brand")}
          />
        </svg>
        <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
          {ready && size > 64 ? <Gift className="mb-0.5 size-5 text-on-accent-subtle" /> : null}
          <span className={cn("font-bold tabular-nums text-fg", text)}>{formatNumber(balance)}</span>
          <span className="text-caption text-fg-muted">{unit}</span>
        </div>
      </div>
      {showCaption && rewardName && goal > 0 ? (
        <p className="text-center text-body-sm text-fg">{ready ? `${rewardName} is ready` : `${formatNumber(toGo)} ${unitFor(terminology, toGo)} to ${rewardName}`}</p>
      ) : null}
    </div>
  );
}
