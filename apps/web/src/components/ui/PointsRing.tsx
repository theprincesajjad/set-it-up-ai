import { cn } from "@/lib/cn";
import { formatNumber, unitFor } from "@/lib/format";

const SIZES = { 64: { stroke: 5, text: "text-[20px] leading-6" }, 120: { stroke: 7, text: "text-[34px] leading-9" }, 200: { stroke: 9, text: "text-[56px] leading-[56px]" } } as const;

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

/** Circular progress to the next reward. v2: thin black ring on a grey track; accent once the reward is ready. */
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
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-bg-muted" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (ready ? 1 : pct))}
            className={cn("transition-[stroke-dashoffset] duration-[600ms] ease-out", ready ? "stroke-accent" : "stroke-fg")}
          />
        </svg>
        <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("display tabular-nums", ready ? "text-accent-text" : "text-fg", text)}>{formatNumber(balance)}</span>
          {size > 64 ? <span className="text-meta text-fg-muted">{unit}</span> : null}
        </div>
      </div>
      {showCaption && rewardName && goal > 0 ? (
        <p className="text-center text-meta text-fg-muted">{ready ? <span className="font-semibold text-accent-text">{rewardName} is ready</span> : `${formatNumber(toGo)} ${unitFor(terminology, toGo)} to ${rewardName}`}</p>
      ) : null}
    </div>
  );
}
